# B2-6 阶段 4 落地性预审报告

> 输入：`B2-6_architecture_v1.0.md` §9 必答问题清单
> 方法：每问需引用真实代码现状，非通用工程偏好

---

## 问题 1：scheduler 实例化时机

**1) 现状**

`notion-service.ts:385` 以模块级单例模式导出 `notionService`：
```ts
export const notionService = new NotionService();
```
App.tsx 中不存在引入 `notionService` 的 import——目前无任何模块消费它。调度器需要的 `dispatch` 函数通过 `useCallback` 定义（`App.tsx:468-482`），其闭包引用 `machineRef.current`。

App.tsx 的初始化顺序为：
1. **同步阶段**（`App()` 函数体）：`useRef` 初始化（`machineRef`、`movementRuntimeRef` 等，`297-347`行）→ `useState`（`349-360`行）→ `useCallback` 定义（`dispatch` 等）
2. **首次渲染后**：`PetCanvas.onReady` → `handlePlayerReady`（`1066-1189`行）→ `machine.init(player)` → `machine.subscribe(...)` → `machine.start({...})` → `machineReadyRef.current = true`（`1184`行）→ hungry 异步判定
3. **并行 useEffect**：shortcut 注册（`1546`行）、DevPanel 定时器（`1680`行）、dialog 过渡 etc.

scheduler 启动需 3 个条件：`setup_completed === '1'` + 非空 `notionToken` + 非空 `todoDbId`。这 3 项需通过 `invoke('config_get_value', ...)` 从 SQLite 异步读取——即必须等到 Tauri runtime 就绪。`handlePlayerReady` 中已有同样模式：异步读取 `PetContextService.getLastCsvImportDate()`（`1154`行）。

**2) 推荐方案**

在 `handlePlayerReady` 末尾、`machineReadyRef.current = true`（`1184`行）之后追加异步 scheduler 初始化。模式与既有的 hungry 判定完全对称（`1151-1182`行）：

```
void (async () => {
  const [setupCompleted, token, dbId] = await Promise.all([
    invoke<string|null>('config_get_value', { key: 'setup_completed' }),
    invoke<string|null>('config_get_value', { key: 'notionToken' }),
    invoke<string|null>('config_get_value', { key: 'todoDbId' }),
  ]);
  if (setupCompleted === '1' && token && dbId) {
    schedulerRef.current = new ReminderScheduler({ ... });
    schedulerRef.current.start();
  }
})();
```

选择 `handlePlayerReady` 而非独立 `useEffect` 的理由：scheduler 依赖 `machine.dispatch`，而 `dispatch` 在 `machineReadyRef.current = true` 之前无法正常工作（`dispatch` 内部有 `machineReadyRef` 守卫，`468-474`行）。hungry 判定在同一位置有 exactly this pattern 的先例。

**3) 风险提示**

- `handlePlayerReady` 在 player 重建时可能被二次调用（有幂等保护，`1069-1074`行），需确保 scheduler 实例化也有幂等保护（`if (schedulerRef.current) return`）
- hungry 判定在 scheduler start 前执行；若 scheduler start 包含"立即首发 poll"，两者并发访问 Notion 可能触发 rate limit。建议 scheduler 首轮 poll 延迟 2-3 秒

---

## 问题 2：ReminderBubble 渲染层级

**1) 现状**

App.tsx JSX 结构（`1812-1889`行）：
```
pet-app-shell
  └── pet-hitbox (pointer events: down/move/up/cancel, click, doubleClick)
        ├── TalkingInteraction (dialog overlay, z-index 管理)
        ├── PetCanvas
        └── pet-status (position: absolute 叠加文本)
  └── DevPanel (Suspense lazy)
```

`pet-status`（`1845`行）使用 `position: absolute` 在 pet-hitbox 内绝对定位。`TalkingInteraction` 内显式 z-index 分层（shell / header / messages / input-bar）。DevPanel 在 `pet-app-shell` 外侧通过 `paddingRight` 挤占空间。

**2) 推荐方案**

ReminderBubble 渲染于 **`pet-hitbox` 内部、`PetCanvas` 之后**，与 `pet-status`（`1845`行）平级：

```tsx
<TalkingInteraction ... />
<PetCanvas ... />
{status ? <div className="pet-status">{status}</div> : null}
{scheduler?.activeReminder ? <ReminderBubble ... /> : null}
```

理由：
1. `pet-hitbox` 的 pointer 事件仅由 drag/pat/doubleClick 处理器拦截——气泡需要自己的点击区域，在 hitbox 内部可以自然捕获事件（stopPropagation）
2. `pet-status` 能共存于同一层级（两者不会同时出现：status 最长 1.8s 自消，而 reminder 需手动 dismiss），不引入新 z-index 层
3. 不放在 `pet-app-shell` 外侧——气泡需要相对宠物位置定位，`pet-hitbox` 的坐标原点就是宠物的参考系
4. 不放在 `TalkingInteraction` 内——dialog 关闭时组件被 unmount，气泡也会丢失

定位策略：用 `COMPACT_PET_ANCHOR_IN_WINDOW`（`dialog-transition.ts:7-12`）的 box center `getBoxCenter()` 计算气泡锚点，`position: absolute` 定位在 `pet-hitbox` 内。

**3) 风险提示**

- 气泡出现期间会阻挡宠物 hitbox 的 click/doubleClick——需在气泡上调用 `stopPropagation`，同时 dismiss 按钮区域独立响应
- 若 `scheduler.activeReminder` 在 targeted_move 期间就非 null（架构稿 §6.1 第 4 条用 `movement.state === 'still'` 保护），但 `PetCanvas` 模式切换可能触发 re-render，需验证气泡挂载时序

---

## 问题 3：工作区边界获取的依赖注入

**1) 现状**

`refreshWindowMovementBounds`（`App.tsx:522-567`）做两件事：
1. **Tauri 调用**：`currentMonitor()` + `appWindow.outerPosition()` + `appWindow.outerSize()`（`530-534`行）
2. **副作用**：写入 `movementRuntimeRef.current`（`minX/maxX/posX/posY`，`554-557`行）+ 触发 `queueWindowPosition`（`560`行）

scheduler 只需要第 1 步的 `{ minX, maxX, posY }`，不需要运行时变异和位置写入。

**2) 推荐方案**

抽出纯查询函数 `getWorkareaBounds()`，注入 scheduler：

```ts
function createGetWorkareaBounds(appWindow, edgePaddingPx) {
  return async () => {
    const [monitor, pos, size] = await Promise.all([
      currentMonitor(),
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    if (!monitor) return null;
    const wa = monitor.workArea;
    const minX = wa.position.x + edgePaddingPx;
    const maxX = wa.position.x + wa.size.width - size.width - edgePaddingPx;
    return { minX, maxX, posY: pos.y };
  };
}
```

在 `handlePlayerReady` 中注入到 scheduler constructor。不与 `refreshWindowMovementBounds` 共享——后者内部还操作 `movementRuntimeRef`，混入 scheduler 会造成竞态。两函数各自的 Tauri 调用是独立的，不影响各自逻辑。

scheduler 在 `evaluate()` 中调用 `getWorkareaBounds()`，失败时 fallback 默认坐标。既有的 `resolveTargetX`（`228-253`行）可在此基础上直接使用。

**3) 风险提示**

- `getWorkareaBounds` 和 `refreshWindowMovementBounds` 偶尔并行调用 Notion `currentMonitor()`，Tauri 对此有内置并发安全，不存在数据竞争
- scheduler test 时提供 fake `getWorkareaBounds`（返回 `{ minX: 0, maxX: 1600, posY: 100 }`）即可——无需 mock Tauri runtime

---

## 问题 4：evaluate 调度策略选型

**1) 现状**

项目中存在两种调度模式：
- **setInterval**：窗口位移 tick（`App.tsx:591`，16ms）、DevPanel 刷新（`1685`行，120ms）
- **setTimeout 链**：`StateMachineTimers`（`timers.ts:29-97`）对 idle timeout / drowsy-to-nap / roaming tick 三个定时器全部使用 `setTimeout` + `clearTimeout`，每次重建

setTimeout 链的优点：动态延迟、无累积漂移。代价：每次需管理 handle 生命周期（cancel + 重建）。StateMachineTimers 中每个 Timer 都有 `clear*()` + `restart*(callback)` 的对称封装——总代码量约 30 行。

**2) 推荐方案**

**MVP 用 `setInterval(60s)`**。

理由：
1. Scheduler 的 evaluate 是长期存活任务（与 app lifecycle 同寿），不需要动态调整周期——todo 的 `dueAt` 间距差异远大于 60s 精度损失，不像 StateMachineTimers 需要精确到 sleep 状态切换
2. 实现简单：仅需一个全局 `evaluateTimerId`，destroy 时 `clearInterval`。对比 `setTimeout(dueAt - now)` 动态重设——需要在每次 dismiss / enqueue / dayChange 后重新计算 nextDueAt 并重建 timer，容易遗漏触发源（架构稿 §3.3 列了 3 种触发源，漏任一种会导致 timer 错过下一个 todo）
3. 精度损失上限 60s——远低于 30min 的 poll 周期，也低于 MVP 的 acceptable latency

如果需要更高精度（≥v1.1），可升级为 hybrid：60s tick 负责日期检测 + fallback，额外 `setTimeout` 以 `queue[0].dueAt - now` 作精确唤醒。

**3) 风险提示**

- `setInterval` 在系统休眠后行为不确定（架构稿 §7 已知限制 #2 已明确）。60s tick 唤醒后最多延迟一个周期——是已知风险，非本方案引入

---

## 问题 5：`dismissedTodayIds` 数据结构

**1) 现状**

项目中使用 `Set` 和 `Map` 的先例：
- `Set<StateListener>`：状态机监听器容器（`StateMachine.ts:76`）
- `Set<HTMLElement>`：dialog 测量帧目标集（`useDialogAnchorTransition.ts:187`，临时生命周期）
- `Map<number, DevTimerRegistryEntry>`：DevPanel 定时器注册表（`App.tsx:303`）
- `Map<string, CachedRect>`：dialog rect 缓存（`useDialogAnchorTransition.ts:73`）

没有跨 session 持久化 `Set`/`Map` 的模式——项目仅通过 SQLite config 表持久化 scalar 值（`PetContextService.ts:17-42`）。

**2) 推荐方案**

**`Set<string>`**。

理由：
1. MVP 场景中 `dismissedTodayIds` 仅需 `has()` 和 `add()` 两个操作——`Set` 直接满足，无需 `Map` 的 kv 结构
2. `dismiss N 小时后再次提醒` 是未定义的 Phase B+ 需求，现在预留 `Map<string, number>` 会导致：
   - 增加复杂度（每次 has 检查前需判断 expireAt 是否过期）
   - 引入"何时清理过期项"的额外设计问题
   - 跨 0 点清空逻辑 vs 持久化过期清理逻辑互斥——两者混在同一个结构中难以维护
3. 若 B2-7+ 确实需要该特性，从 `Set<string>` 升级到 `Map<string, { dismissedAt: number; renotifyAfterMs: number }>` 是纯内部重构——不改变 scheduler public API

**3) 风险提示**

- `Set` 不被 JSON 序列化——强调"不持久化"约束（architecture §7 #1）。若未来需持久化，届时再迁移到 `Record<string, number>` 或 SQLite 表

---

## 问题 6：决策 A 的 416ms 撕裂风险（关键）

**1) 现状：逐帧追踪 talking → reminding 全链路**

**T+0**（scheduler dispatch `reminder.due`）：
- StateMachine `dispatch()` → `processQueuedEvents()`（`StateMachine.ts:186`）→ `handleEvent()` → `handleReminderDue(target)`（`398`行）→ `enterTargetedReminder(target)`（`704`行）
- `enterTargetedReminder` 中 `commitState({ major: 'reminding', movement: { state: 'targeted_move' } })`（`713`行）→ `emitStateChanged()`（`731`行）

**T+0**（subscriber 回调，`App.tsx:1080`）：第一个 listener（main subscriber）触发 → `syncWindowMovementFromState(nextState)`（`1088`行）→ **被 `dialogModeActiveRef.current === true` 阻断**（`650`行）→ `stopWindowMovementLoop()` → return

**T+0**（bridge 回调，`App.tsx:1124`）：第二个 listener 触发 → `watchTalkingExitForDialogSync` 检测到 `talking → reminding` + `shouldBridgeCloseDialog() === true` → `requestDialogClose({ dispatchStateEvent: false })`（`1132-1136`行）→ `setDialogRequestedOpen(false)` → React effect 触发 `runDialogCloseTransition`（`1025-1031`行）→ `setDialogVisible(false)`（`896`行）

**T+0 ~ T+416ms**（关闭动画）：
- `closing.messages`：180ms 气泡淡出
- `closing.shell`：220ms clip-path 收束
- `closing.window`：`runDialogCloseWindowSnap`（16ms + async Tauri setSize/setPosition）
- 全程 `dialogModeActiveRef.current === true`（动画开始前就为 true，`finalizeDialogClose` 之后才变 false）

**T+~416ms+**（关闭完成）：`handleDialogTransitionPhaseChange("compact")` → `finalizeDialogClose()`（`710-726`行）→ `dialogModeActiveRef.current = false`（`717`行）+ `dialogMovementResumeAtMsRef.current = now + 220ms`（`716`行）

**T+416ms 之后**：状态机仍为 `reminding/targeted_move`，但 **无任何事件触发 `syncWindowMovementFromState` 重新执行**——状态订阅仅当状态变化时触发（`emitStateChanged` 在 `commitState` 内），而 `finalizeDialogClose` 不 dispatch 任何 PetEvent。

**结论：`walk.targeted` 动画持续播放，物理窗口停留在原地不动——窗口位移循环被永久阻断。**

**2) 推荐方案**

scheduler 内延迟 dispatch，而非修改 App.tsx 关闭流程。在 `evaluate()` 判定 `dueAt <= now` 后，dispatch 前，增加 dialog 门控：

```ts
if (this.getIsDialogActive()) {
  this.evaluateRetryTimerId = window.setTimeout(() => {
    this.evaluateRetryTimerId = null;
    this.evaluate();
  }, 500);
  return;
}
this.evaluateRetryTimerId = null;
// ... dispatch reminder.due
```

`getIsDialogActive` 由 `App.tsx` 在 scheduler construct 时注入（`() => dialogModeActiveRef.current`），实现为同步无参布尔查询。500ms 重试周期远大于 416ms 关闭时长，最多重试 2-3 次后对话框必然已关闭。**不修改 `syncWindowMovementFromState`、`dialogStateBridge`、`runDialogCloseTransition` 中任何一行。**

**3) 概率评级：高**

评级依据：
- 触发条件确定：talking 中任一 timed todo 到期即触发
- 路径唯一化：`enterTargetedReminder` → `syncWindowMovementFromState` → `dialogModeActiveRef` 守卫 → return——无论时序如何排列，`dialogModeActiveRef.current` 在 `finalizeDialogClose` 之前永远为 `true`
- `syncWindowMovementFromState` 仅在状态机状态变化时被调用——而 dialog 关闭过程不产生任何 PetEvent → 不存在事后重试
- 因此遍历该路径 **100% 重现**，概率评定为**高**
- 严重程度：中（宠物看起来卡住，但 `walk.targeted` 动画仍在播放，用户 perception 是"在抖但不走"；可通过 pat 等外部事件打破僵局）

---

## 问题 7：`TimedTodoWithDueAt` 类型定位

**1) 现状**

类型定义分层：
- B0-3 接口类型在 `src/types/notion-types.ts`（59 行），包含 `TimedTodo`（`38-42`行）
- 服务内部类型在各自文件：`NotionPage` / `NotionQueryResponse` 只在 `notion-service.ts` 内定义（`47-78`行）
- `WorkoutService` 无独立 types 文件——所有类型在 `WorkoutService.ts` 内部
- 只有跨模块共享的类型才放在 `src/types/`：`notion-types.ts`、`deepseek-types.ts`、`wizard-types.ts`

`TimedTodo` 已有 3 字段（`id` / `title` / `reminderTime`），被 `NotionServicePort.getTodayTimedTodos` 返回类型引用（`notion-types.ts:48`）。架构稿 §1.3 将 `notion-service.ts` 列为"不动的模块"。

**2) 推荐方案**

**放在 `src/services/ReminderScheduler.ts` 内部**，不污染 `notion-types.ts`。

理由：
1. `dueAt` 是 scheduler 本地计算的派生字段（`new Date(`${today}T${hhmm}:00`).getTime()`），非 Notion API 返回值——放入 `notion-types.ts` 会打破 B0-3 语义边界
2. `notion-types.ts` 被 `NotionServicePort` 消费者 import——若任何文件 import `TimedTodo` 就拖入 `dueAt` 字段，会产生误导：消费者可能以为 Notion API 返回此字段
3. 项目先例：`NotionPage` / `NotionBlock` 等 Notion API 内部类型全部在 `notion-service.ts` 内定义（`51-77`行），不导出
4. scheduler 只需定义 `interface TimedTodoWithDueAt extends TimedTodo { dueAt: number }` 即可，类型安全且隔离

**3) 风险提示**

- Scheduler 在 enqueue 时需要从 `TimedTodo` map 到 `TimedTodoWithDueAt`（单行赋值 + 日期拼接），不会更改上游类型契约

---

## 汇总：阻塞项与行动建议

| 问题 | 判定 | 行动 |
|-|-|-|
| Q1 实例化时机 | 可行 | `handlePlayerReady` 末尾异步初始化 |
| Q2 渲染层级 | 可行 | pet-hitbox 内、PetCanvas 后 |
| Q3 边界注入 | 可行 | 抽纯函数 `getWorkareaBounds` 注入 scheduler |
| Q4 evaluate 策略 | 可行 | `setInterval(60s)` |
| Q5 数据结构 | 可行 | `Set<string>` |
| **Q6 416ms 撕裂** | **需兜底** | scheduler 增加 `getIsDialogActive` 门控，dispatch 前重试 500ms |
| Q7 类型定位 | 可行 | scheduler 内部 `extends TimedTodo` |

**Q6 是唯一需要架构层确认的阻塞项。** 推荐方案（scheduler 侧延迟 dispatch）不改动任何既有代码路径，仅增加一个注入回调 + 重试循环。请求确认后 GPT 可据此写入任务卡的"特殊约束"章节。