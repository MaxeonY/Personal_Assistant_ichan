# B2-6 任务卡 · 待办提醒功能

**版本**: v1.2（Codex 可执行版，收敛 DeepSeek v1.1 落地性预审 + Claude v0.2 架构裁定）  
**日期**: 2026-04-30  
**执行**: Codex  
**对应任务**: B2-6（待办提醒功能）  
**依赖**: B0-3（Notion Service，已完成）、B1-7（首次启动配置，已完成）、B1-10/B1-10A（对话 UI + anchor 过渡，已完成）、Phase A StateMachine 基线

---

## 行号引用约定

本卡引用的所有行号均为**参考定位**，基于 DeepSeek v1.1 落地性预审所记录的代码快照。Codex 必须先用 `rg -n "<关键字>"` 确认实际位置后再编辑。行号偏差不视为任务卡错误。

---

## 0. 任务定位

实现 Notion timed todo 到点提醒链路：

```text
Notion 今日 timed todo
  → ReminderScheduler poll/enqueue/evaluate
  → dispatch({ type: 'reminder.due', target })
  → StateMachine 进入 targeted_move
  → movement.arrive 后进入 reminding
  → ReminderBubble 显示
  → 用户 dismiss
  → dispatch({ type: 'reminder.dismiss' })
  → 回 idle.awake
```

本卡只做 **scheduler + UI 气泡 + App 接线 + DevPanel 验证入口 + 文档闭环**。不改状态机契约，不新增事件，不改 NotionService 的既有接口。

---

## 1. 范围

### 1.1 范围内

- 新增 `src/services/ReminderScheduler.ts`：
  - Notion timed todo 轮询；
  - 内存队列上限 3；
  - `dueAt` 判定；
  - dialog 活跃门控；
  - `dismissedTodayIds` 当日去重；
  - scheduler snapshot / listener，供 React 层渲染气泡与 DevPanel 状态。
- 新增 `src/utils/windowTargetResolver.ts`：从 App 中抽出目标点解析逻辑，供提醒 targeted_move 复用。
- 新增 `src/components/Reminder/ReminderBubble.tsx` 及样式。
- 修改 `src/App.tsx`：
  - 在 `machineReadyRef.current = true` 后按配置初始化 scheduler；
  - 注入 `dispatch`、`getWorkareaBounds`、`getIsDialogActive`、`resolveTarget`；
  - 挂载 `ReminderBubble`；
  - unmount 时销毁 scheduler。
- 修改 `src/components/DevPanel/DevPanel.tsx`：
  - 保留 raw `Force reminder.due`；
  - 新增 `Simulate Notion timed todo`；
  - 展示 scheduler snapshot。
- 在 `src/config/petBehaviorConfig.ts` 增加 reminder 参数组，并同步 `behavior_config.md` / `param_audit.md` / `docs_index.md` / `phaseb_execution_plan.md` / `ichan_project_doc.md`。

### 1.2 范围外

- **不**新增 `MajorState`。
- **不**新增 `PetEvent`。
- **不**修改 `StateMachine` public API。
- **不**修改 `src/services/notion-service.ts` 的对外契约。
- **不**修改 `dialogStateBridge.ts`、`runDialogCloseTransition`、`finalizeDialogClose`。
- **不**实现系统通知。
- **不**实现 `dismissedTodayIds` 跨进程持久化。
- **不**支持运行时修改 Notion token / DB ID 后热更新 scheduler；配置变更需重启应用。
- **不**处理跨天 timed todo；本期只消费 `getTodayTimedTodos(todoDbId)`。

---

## 2. 已决议项（Claude v0.2 固化，不再讨论）

| 编号 | 决议 | 落地要求 |
|---|---|---|
| A | talking 期间 reminder 是硬打断；集成层不预先派发 `dialog.close` | 不在 B2-6 中新增或调用 `dialog.close` |
| B | scheduler 内存队列串行处理，上限 3 条，超出丢弃 + log | `maxQueueSize = 3`，第 4 条起 `console.warn` 后 skip |
| C | DevPanel 双按钮分离 | raw 按钮只 dispatch；simulate 按钮必须走 scheduler |
| D | scheduler dispatch `reminder.due` 前增加 dialog 门控 | `getIsDialogActive() === true` 时 500ms 重试，最多 60 次；超限丢弃 + 加入 `dismissedTodayIds` + log |

DeepSeek v1.1 中“scheduler 首轮 poll 延迟 2-3 秒”的风险提示已被架构稿否决：hungry 判定读本地 SQLite，不访问 Notion，不存在与 scheduler 首轮 poll 的 Notion rate limit 冲突。**首轮 poll 必须立即执行，不延迟。**

---

## 3. 接口与数据结构

### 3.1 ReminderScheduler 内部类型

在 `src/services/ReminderScheduler.ts` 内部定义，不写入 `src/types/notion-types.ts`：

```ts
import type { TimedTodo } from '../types/notion-types';
import type { Coord, PetEvent } from '../components/Pet/types';

type SchedulerStatus = 'idle' | 'polling' | 'disabled';

interface TimedTodoWithDueAt extends TimedTodo {
  dueAt: number;
}

interface WorkareaBounds {
  minX: number;
  maxX: number;
  posY: number;
}

interface ReminderSchedulerSnapshot {
  status: SchedulerStatus;
  queueSize: number;
  activeReminder: TimedTodoWithDueAt | null;
  dismissedTodayCount: number;
  dialogGateRetryCount: number;
  lastPollError: string | null;
  lastPollAt: number | null;
}
```

`TimedTodoWithDueAt` 是 scheduler 派生字段，不属于 Notion API 返回契约。

### 3.2 ReminderScheduler 构造参数

```ts
interface ReminderSchedulerDeps {
  notionService: {
    getTodayTimedTodos(databaseId: string): Promise<TimedTodo[]>;
  };
  todoDbId: string;
  dispatch: (event: PetEvent) => void;
  resolveTarget: (bounds: WorkareaBounds | null) => Coord;
  getWorkareaBounds: () => Promise<WorkareaBounds | null>;
  getIsDialogActive: () => boolean;
  onSnapshot?: (snapshot: ReminderSchedulerSnapshot) => void;
}
```

约束：

- `dispatch` 只派发现有 `reminder.due` / `reminder.dismiss`。
- `getIsDialogActive` 由 App 注入：`() => dialogModeActiveRef.current`。
- `onSnapshot` 只用于 React 层同步，不允许 scheduler import React。

### 3.3 `petBehaviorConfig.ts` 新增参数组

在 `src/config/petBehaviorConfig.ts` 的 `ui` 参数组之前新增：

```ts
  reminder: {
    pollIntervalMs: 30 * 60 * 1000,
    evaluateIntervalMs: 60 * 1000,
    maxQueueSize: 3,
    dialogGateRetryMs: 500,
    dialogGateMaxRetries: 60,
    bubbleTitleMaxChars: 20,
  },
```

这些是实现参数，不是接口契约。同步到 `behavior_config.md` 与 `param_audit.md`。

---

## 4. Scheduler 行为规则

### 4.1 start

`start()` 必须幂等：

```text
if pollTimerId !== null 或 status !== 'idle' → return
status = 'idle'
立即执行 poll()                     // 不等 30min，不做 2-3 秒延迟
setInterval(poll, reminder.pollIntervalMs)
setInterval(evaluate, reminder.evaluateIntervalMs)
```

### 4.2 poll/enqueue

```text
poll():
  status = 'polling'
  todos = await notionService.getTodayTimedTodos(todoDbId)
  对每条 todo:
    if todo.id in dismissedTodayIds → skip
    if todo.id === activeReminder?.id → skip
    if queue 已存在同 id → skip
    dueAt = parseTodayDueAt(todo.reminderTime)
    if dueAt === null → console.warn + skip
    if queue.length >= maxQueueSize → console.warn + skip
    queue.push({ ...todo, dueAt })
  status = 'idle'
  emitSnapshot()
  evaluate()
```

`parseTodayDueAt` 使用本地日期，格式只接受 `HH:mm`：

```ts
const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reminderTime);
```

bad data 单条 skip，不影响其它 todo。

### 4.3 evaluate

```text
evaluate():
  if activeReminder !== null → return
  if queue.length === 0 → return
  candidate = queue[0]
  if candidate.dueAt > Date.now() → return

  if getIsDialogActive() === true:
    if evaluateRetryTimerId !== null → return   // 防重复 retry timer
    dialogGateRetryCount += 1
    if dialogGateRetryCount > dialogGateMaxRetries:
      queue.shift()
      dismissedTodayIds.add(candidate.id)
      console.warn('[reminder] dropped after 30s of dialog activity', candidate.id)
      clear retry timer
      dialogGateRetryCount = 0
      emitSnapshot()
      return
    evaluateRetryTimerId = window.setTimeout(() => {
      evaluateRetryTimerId = null
      evaluate()
    }, dialogGateRetryMs)
    emitSnapshot()
    return

  clear retry timer
  dialogGateRetryCount = 0
  bounds = await getWorkareaBounds().catch(() => null)
  target = resolveTarget(bounds)
  queue.shift()
  activeReminder = candidate
  emitSnapshot()
  try dispatch({ type: 'reminder.due', target })
  catch:
    activeReminder = null
    queue.unshift(candidate)
    emitSnapshot()
    console.error('[reminder] dispatch reminder.due failed')
```

`dialogGateRetryCount` 的比较使用 `> dialogGateMaxRetries`，从第 61 次进入丢弃路径；即 500ms × 60 次有效等待，约 30s。

### 4.4 dismiss

```text
dismiss(source):
  if activeReminder !== null:
    dismissedTodayIds.add(activeReminder.id)
  activeReminder = null
  clear evaluateRetryTimerId
  dialogGateRetryCount = 0
  emitSnapshot()
  dispatch({ type: 'reminder.dismiss' })
  evaluate()
```

dismiss 入口：

- `ReminderBubble` 的 X 按钮；
- DevPanel existing/raw `Force reminder.dismiss`，如已有按钮；若无，不新增额外 raw dismiss 按钮。

### 4.5 dayChange

60s evaluate tick 中同步检查本地日期 key：

```text
if getLocalDateKey() !== currentDateKey:
  currentDateKey = next
  dismissedTodayIds.clear()
  emitSnapshot()
  poll()     // 立即 poll，不等 30min
else:
  evaluate()
```

---

## 5. 事件流图与 payload 过滤

### 5.1 主路径

```text
[Notion timed todo]
  │ poll()
  ▼
[ReminderScheduler.queue]
  │ evaluate(): dueAt <= now && !dialogActive
  ▼
dispatch({ type: 'reminder.due', target })
  │
  ▼
StateMachine: targeted_move
  │ movement.arrive
  ▼
StateMachine: major='reminding', movement='still'
  │ React render guard
  ▼
ReminderBubble
  │ click X + stopPropagation
  ▼
scheduler.dismiss('bubble')
  │
  ▼
dispatch({ type: 'reminder.dismiss' })
```

### 5.2 DevPanel 双按钮分离

DevPanel 必须显式区分 payload type，不允许用一个宽泛的 `reminder` payload 混跑两条路径：

```ts
function handleReminderDevAction(payload: ReminderDevAction): void {
  if (payload.type === 'reminder.due.raw') {
    dispatch({ type: 'reminder.due', target: payload.target });
    return;
  }

  if (payload.type === 'notionTimedTodo.simulate') {
    schedulerRef.current?.devSimulate(payload.todo);
    return;
  }
}
```

约束：

- `reminder.due.raw`：不进 scheduler、不入 queue、不写 `dismissedTodayIds`。
- `notionTimedTodo.simulate`：必须调用 scheduler 的 `devSimulate(todo)`，走 enqueue/evaluate/dialog gate/dismiss 去重全路径。
- 任何 unknown `payload.type`：`console.warn` 后 return。

---

## 6. ReminderBubble 挂载与交互

### 6.1 App 挂载位置

在 `pet-hitbox` 内，`PetCanvas` 之后，与 `pet-status` 平级挂载：

```tsx
<TalkingInteraction ... />
<PetCanvas ... />
{status ? <div className="pet-status">{status}</div> : null}
{shouldShowReminderBubble ? (
  <ReminderBubble reminder={schedulerSnapshot.activeReminder} onDismiss={handleReminderDismiss} />
) : null}
```

### 6.2 挂载条件

```ts
const shouldShowReminderBubble =
  schedulerRef.current !== null &&
  schedulerSnapshot.activeReminder !== null &&
  devSnapshot?.state.major === 'reminding' &&
  devSnapshot?.state.movement.state === 'still';
```

### 6.3 气泡内容

| 区域 | 内容 |
|---|---|
| 主标题 | `activeReminder.title`，超过 `reminder.bubbleTitleMaxChars` 截断 |
| 副标题 | `今天 ${activeReminder.reminderTime}` |
| 关闭按钮 | `×` |

### 6.4 事件传播

- X 按钮 click 必须 `event.stopPropagation()`。
- 气泡容器本身也应阻断 pointer down/up/click 传播，避免误触 pet drag/pat/doubleClick。
- 不新增气泡正文点击行为。

---

## 7. 实施步骤（按 commit 拆分，逐条执行）

---

### Commit 0 — `feat:` add reminder scheduler core and target resolver

**目标**：新增纯服务与目标点解析，不接 App、不接 UI。

**前置检查**：

```bash
rg -n "resolveTargetX|targetedDefaultWorkareaX|windowMovement" src/App.tsx src/config
rg -n "getTodayTimedTodos|TimedTodo|NotionServicePort" src/services src/types
rg -n "reminder\.due|reminder\.dismiss|movement\.arrive" src/components src/state docs/01_contracts/interface_v1_2.md
rg -n "setInterval\(|clearInterval\(|setTimeout\(" src/App.tsx src/state src/components
```

**改动清单**：

A. 新建 `src/utils/windowTargetResolver.ts`：

- 导出 `WorkareaBounds`。
- 导出 `resolveReminderTarget(bounds: WorkareaBounds | null): Coord`。
- 复用 `petBehaviorConfig.windowMovement.targetedDefaultWorkareaX`。
- bounds 为 null 时返回 fallback 坐标，不能 throw。

B. 新建 `src/services/ReminderScheduler.ts`：

- 实现 §3 / §4 的类型与行为。
- 实现 `start()` / `destroy()` / `dismiss()` / `devSimulate(todo)` / `getSnapshot()`。
- 实现内部 `emitSnapshot()`。
- `destroy()` 必须 clear：`pollTimerId`、`evaluateTimerId`、`evaluateRetryTimerId`，并清空 queue / dismissedTodayIds / activeReminder。

C. 修改 `src/config/petBehaviorConfig.ts`：新增 `reminder` 参数组。

**Commit 0 验收**：

```bash
pnpm exec tsc --noEmit
rg -n "ReminderScheduler|resolveReminderTarget|dialogGateMaxRetries|pollIntervalMs" src/
rg -n "dialog\.close|new PetEvent|MajorState" src/services/ReminderScheduler.ts src/utils/windowTargetResolver.ts
```

必须满足：

- TypeScript 无错误。
- 新文件不 import React。
- 新文件不 import `dialogStateBridge`。
- 新文件不新增 `PetEvent` / `MajorState`。

---

### Commit 1 — `test:` cover scheduler queue, dialog gate, dismiss and day change

**目标**：先锁服务层行为，避免 App 接线后难排错。

**前置检查**：

```bash
rg -n "vitest|describe\(|it\(|expect\(" src test tests
rg -n "ReminderScheduler" src/services
rg -n "petBehaviorConfig" src/config src/services
```

**改动清单**：

A. 新建 `src/services/ReminderScheduler.test.ts`（或项目现有测试目录对应位置）。

B. 覆盖以下用例：

1. `start()` 后立即 poll；
2. 同一轮 5 条 due todo → 仅入队/触发前 3 条，后 2 条 warn skip；
3. `activeReminder !== null` 时不抢占；
4. dismiss 后同 id 进入 `dismissedTodayIds`，再次 poll 同条 skip；
5. dialog active 时不 dispatch，500ms retry；
6. dialog active 超过 60 次后丢弃 + dismissed；
7. `evaluateRetryTimerId !== null` 时不重复创建 retry timer；
8. dispatch 抛错时 active 回滚，candidate 放回队首；
9. 本地日期变化后清空 dismissed 并立即 poll；
10. bad `reminderTime` 单条 skip，不影响其它 todo。

**Commit 1 验收**：

```bash
pnpm test -- ReminderScheduler
pnpm exec tsc --noEmit
```

若项目当前未配置 targeted test 命令，则执行：

```bash
pnpm test
```

---

### Commit 2 — `feat:` wire scheduler into App lifecycle

**目标**：在 pet 主窗口就绪后按配置启动 scheduler。

**前置检查**：

```bash
rg -n "machineReadyRef\.current = true|handlePlayerReady|machine\.start" src/App.tsx
rg -n "config_get_value|setup_completed|notionToken|todoDbId" src/ src-tauri/
rg -n "schedulerRef|ReminderScheduler|PetContextService|getLastCsvImportDate" src/App.tsx src/services
rg -n "currentMonitor|outerPosition|outerSize|refreshWindowMovementBounds" src/App.tsx
```

**改动清单**：

A. `src/App.tsx` imports：

- `notionService` from `src/services/notion-service.ts`；
- `ReminderScheduler`；
- `resolveReminderTarget`；
- `invoke` 若当前文件尚未 import。

B. 新增 refs/state：

```ts
const schedulerRef = useRef<ReminderScheduler | null>(null);
const [schedulerSnapshot, setSchedulerSnapshot] = useState<ReminderSchedulerSnapshot | null>(null);
```

C. 在 `handlePlayerReady` 中，`machineReadyRef.current = true` 后启动异步初始化：

```ts
void (async () => {
  if (schedulerRef.current) return;

  const [setupCompleted, token, dbId] = await Promise.all([
    invoke<string | null>('config_get_value', { key: 'setup_completed' }),
    invoke<string | null>('config_get_value', { key: 'notionToken' }),
    invoke<string | null>('config_get_value', { key: 'todoDbId' }),
  ]);

  if (setupCompleted !== '1' || !token || !dbId) return;

  schedulerRef.current = new ReminderScheduler({
    notionService,
    todoDbId: dbId,
    dispatch,
    resolveTarget: resolveReminderTarget,
    getWorkareaBounds,
    getIsDialogActive: () => dialogModeActiveRef.current,
    onSnapshot: setSchedulerSnapshot,
  });

  schedulerRef.current.start();
})();
```

D. 新增 `getWorkareaBounds()`：

- 只查询 `currentMonitor()` / `appWindow.outerPosition()` / `appWindow.outerSize()`；
- 不写 `movementRuntimeRef`；
- 不调用 `queueWindowPosition`；
- 失败返回 `null`。

E. App unmount 清理：

```ts
useEffect(() => {
  return () => {
    schedulerRef.current?.destroy();
    schedulerRef.current = null;
  };
}, []);
```

**Commit 2 验收**：

```bash
pnpm exec tsc --noEmit
pnpm tauri dev
```

手动验证：

- 未完成 setup 或缺 token/dbId：不访问 Notion，不报错。
- 配置完整：启动后立即 poll 一次。
- 关闭应用窗口：scheduler timers 被清理，无重复 poll log。
- 再次触发 `handlePlayerReady`：不重复创建 scheduler。

---

### Commit 3 — `feat:` add ReminderBubble and dismiss integration

**目标**：完成 reminding 到达后的气泡显示与 dismiss。

**前置检查**：

```bash
rg -n "pet-hitbox|pet-status|PetCanvas|TalkingInteraction" src/App.tsx src/components
rg -n "reminder\.dismiss|handle.*Dismiss|dispatch\(\{ type: 'reminder.dismiss'" src/App.tsx src/state src/components
rg -n "COMPACT_PET_ANCHOR_IN_WINDOW|DIALOG_STAGE_LAYOUT|dialog-transition" src/components src/
rg -n "\.css'|className=\"pet-status|Reminder" src/App.tsx src/components
```

**改动清单**：

A. 新建 `src/components/Reminder/ReminderBubble.tsx`。

B. 新建样式文件：

- 若 App 现有全局样式为 `src/App.css`，则新增 reminder BEM 段；
- 若组件目录已有局部 CSS 习惯，则新建 `src/components/Reminder/ReminderBubble.css` 并在组件 import。

C. `src/App.tsx` 中新增：

```ts
const handleReminderDismiss = useCallback((event?: React.SyntheticEvent) => {
  event?.stopPropagation();
  schedulerRef.current?.dismiss('bubble');
}, []);
```

D. 在 `pet-hitbox` 内、`PetCanvas` 后挂载，条件使用 §6.2。

**Commit 3 验收**：

```bash
pnpm exec tsc --noEmit
pnpm tauri dev
```

手动验证：

- due reminder 到达前台并 `movement.state === 'still'` 后，气泡显示。
- 点击气泡 X：气泡消失，状态回 `idle.awake`。
- 点击气泡 X 不触发 pet click / pat / doubleClick。
- `activeReminder !== null` 但仍在 `targeted_move` 时，气泡不提前显示。

---

### Commit 4 — `feat:` split DevPanel raw reminder and scheduler simulation paths

**目标**：实现决策 C，并暴露 scheduler 观测信息。

**前置检查**：

```bash
rg -n "DevPanel|Force reminder\.due|reminder\.due|Event Injection" src/App.tsx src/components/DevPanel
rg -n "Toggle isHungry|PetFullState|Movement|Timers" src/components/DevPanel src/App.tsx
rg -n "schedulerSnapshot|ReminderSchedulerSnapshot|devSimulate|dismissedToday" src/
rg -n "payload\.type|handle.*Dev|on.*Reminder" src/components/DevPanel src/App.tsx
```

**改动清单**：

A. `src/components/DevPanel/DevPanel.tsx` props 新增：

```ts
schedulerSnapshot: ReminderSchedulerSnapshot | null;
onForceReminderDueRaw: () => void;
onSimulateNotionTimedTodo: () => void;
```

B. 保留现有 raw reminder 按钮，文案调整为：

```text
Force reminder.due (raw)
```

该按钮只调用 `onForceReminderDueRaw`，由 App 直接 dispatch：

```ts
dispatch({ type: 'reminder.due', target: resolveReminderTarget(null) });
```

C. 新增按钮：

```text
Simulate Notion timed todo
```

该按钮调用：

```ts
schedulerRef.current?.devSimulate({
  id: `dev-reminder-${getLocalDateKey()}`,
  title: 'DEV 模拟待办提醒',
  reminderTime: getLocalHHmmNowOrPast(),
});
```

`reminderTime` 必须设为当前时间或已过去 1 分钟，保证立即 due。

D. DevPanel 中新增只读卡片：

```tsx
Scheduler
{
  status,
  queueSize,
  activeReminder,
  dismissedTodayCount,
  dialogGateRetryCount,
  lastPollError,
  lastPollAt
}
```

E. DevPanel handler 使用 §5.2 的 `payload.type` 分支，unknown payload warn 后 return。

**Commit 4 验收**：

```bash
pnpm exec tsc --noEmit
pnpm tauri dev
```

手动验证：

- `Force reminder.due (raw)`：不进入 scheduler queue，不改变 `dismissedTodayCount`。
- `Simulate Notion timed todo`：进入 scheduler 路径；dismiss 后 `dismissedTodayCount + 1`。
- 同一天再次 simulate 同 id：被 `dismissedTodayIds` skip。
- Scheduler 卡片可观察 `status / queueSize / activeReminder / dialogGateRetryCount`。

---

### Commit 5 — `docs:` sync reminder docs and audit indexes

**目标**：完成文档闭环。

**前置检查**：

```bash
rg -n "Reminder|reminder|待办提醒|轻量提醒" docs src/config
rg -n "param_audit|behavior_config|docs_index|phaseb_execution_plan|ichan_project_doc" docs
rg -n "pollIntervalMs|evaluateIntervalMs|maxQueueSize|dialogGateRetryMs|bubbleTitleMaxChars" src docs
rg -n "B2-6|任务6|Batch 2" docs/03_execution/phaseb_execution_plan.md docs/ichan_project_doc.md
```

**改动清单**：

A. `docs/01_contracts/behavior_config.md`：

- 版本号升至下一版，例如 `v1.4 - 2026-04-30`。
- 在 UI/Bubble/Toast 参数之后新增 `Reminder Scheduler 参数` 小节：

| 参数名 | 当前冻结值 | 说明 |
|---|---:|---|
| `reminder.pollIntervalMs` | `1800000` | Notion timed todo poll 周期，30min |
| `reminder.evaluateIntervalMs` | `60000` | dueAt 检测周期，60s |
| `reminder.maxQueueSize` | `3` | 内存队列上限 |
| `reminder.dialogGateRetryMs` | `500` | talking/dialog 活跃时 dispatch 前重试间隔 |
| `reminder.dialogGateMaxRetries` | `60` | dialog gate 最大重试次数，约 30s |
| `reminder.bubbleTitleMaxChars` | `20` | 提醒气泡标题截断长度 |

B. `docs/param_audit.md`：

- 在“宠物行为与时序参数”或新增“提醒调度参数”中加入上述 6 个参数。
- 标明源文件 `src/config/petBehaviorConfig.ts`。

C. `docs/docs_index.md`：

- 若新增 `docs/02_ui_schema/reminder_bubble_schema.md`，则把它加入 UI Schema 目录树与携带矩阵。
- 若本次只在 `behavior_config.md` 记录气泡参数，则在携带矩阵的“待办提醒 / ReminderBubble”场景中标注：默认集 + `behavior_config.md` + `readme_devpanel.md`。

D. `docs/readme_devpanel.md`：

- `Event Injection` 增加：`Force reminder.due (raw)`；
- 新增 scheduler simulation 说明：`Simulate Notion timed todo` 走完整 scheduler 路径。

E. `docs/03_execution/phaseb_execution_plan.md`：

- 新增 B2-6 实施报告占位，状态标记为“待 Codex 实施”。
- 实施完成后 Codex 回填测试结果。

F. `docs/ichan_project_doc.md`：

- 当前任务看板中将 B2-6 标记为进行中或待验收，不提前标记 Done。

G. 本任务卡保存到：

```text
docs/04_task_cards/active/B2-6_task_card_v1.2.md
```

**Commit 5 验收**：

```bash
pnpm exec tsc --noEmit
rg -n "reminder\.pollIntervalMs|dialogGateMaxRetries|Simulate Notion timed todo|B2-6_task_card_v1.2" docs src/config
```

---

## 8. 总体验收清单

### 8.1 自动化

- [ ] `pnpm exec tsc --noEmit` 通过。
- [ ] `pnpm test -- ReminderScheduler` 或 `pnpm test` 通过。
- [ ] `pnpm tauri build --debug` 通过。

### 8.2 主路径手动验收

- [ ] 配置完整 + Notion 中存在今日已过时间 timed todo：启动后立即 poll，进入 scheduler queue。
- [ ] scheduler evaluate 后 dispatch `reminder.due`。
- [ ] 宠物进入 `walk.targeted` / `targeted_move` 并移动到前台目标点。
- [ ] `movement.arrive` 后进入 `major='reminding'` 且 `movement='still'`。
- [ ] ReminderBubble 显示标题与时间。
- [ ] 点击 X 后 dispatch `reminder.dismiss`，回到 `idle.awake`。
- [ ] 下轮 poll 同一 todo 被 `dismissedTodayIds` skip。

### 8.3 决策 A + D 联合验收

- [ ] talking/dialog 打开期间点击 `Simulate Notion timed todo`。
- [ ] scheduler 不立即 dispatch `reminder.due`，而是 `dialogGateRetryCount` 增加。
- [ ] dialog 关闭完成后（约 416ms）下一轮 retry dispatch `reminder.due`。
- [ ] 宠物物理窗口正常 targeted_move，不出现“动画走路但窗口不动”。
- [ ] dialog 持续活跃超过 30s：该提醒被静默丢弃，加入 `dismissedTodayIds`，输出 log。

### 8.4 决策 B 验收

- [ ] 同一轮 poll 返回 5 条 due todo：仅前 3 条入队，后 2 条 warn skip。
- [ ] 第 1 条 dismiss 后才触发第 2 条；第 2 条 dismiss 后才触发第 3 条。
- [ ] activeReminder 存在期间，不抢占。

### 8.5 决策 C 验收

- [ ] `Force reminder.due (raw)` 不经过 scheduler，不改变 queue / dismissed。
- [ ] `Simulate Notion timed todo` 经过 scheduler，dismiss 后进入 dismissed。
- [ ] DevPanel scheduler snapshot 与行为一致。

### 8.6 错误降级

- [ ] 无效 Notion token：scheduler 转 `disabled`，宠物正常运行，不弹用户错误 UI。
- [ ] 网络错误：本轮 poll skip，下轮继续。
- [ ] bad `reminderTime`：单条 skip，其它条正常。
- [ ] `getWorkareaBounds()` 失败：fallback target 仍可触发提醒。

---

## 9. 已知限制

1. `dismissedTodayIds` 不持久化：应用重启后当天已 dismiss 的提醒可能再次出现。
2. 系统休眠后 `setInterval` 不保证准时；唤醒后可能延迟到下一次 poll/evaluate。
3. 运行时修改 Notion 配置需要重启应用。
4. 只处理今日 timed todo，不处理明天或跨天提醒。
5. 多显示器策略复用当前 targeted_move 规则，不新增适配。
6. talking/dialog 活跃时提醒会延迟 500ms~30s；超过 30s 后该条提醒静默丢弃。

---

## 10. 不允许的实现

- 不允许新增 `dialog.close`。
- 不允许修改 `StateMachine` public API。
- 不允许将 `TimedTodoWithDueAt` 写入 `notion-types.ts`。
- 不允许 scheduler import React 或 UI 组件。
- 不允许 `ReminderBubble` 直接 import scheduler。
- 不允许 raw DevPanel reminder 按钮写入 scheduler 队列。
- 不允许首轮 poll 延迟 2-3 秒。

---

## 11. 文件路径清单

预计变更：

```text
src/config/petBehaviorConfig.ts
src/services/ReminderScheduler.ts
src/services/ReminderScheduler.test.ts
src/utils/windowTargetResolver.ts
src/components/Reminder/ReminderBubble.tsx
src/components/Reminder/ReminderBubble.css       # 或 App.css 中新增 BEM 段
src/components/DevPanel/DevPanel.tsx
src/App.tsx

docs/01_contracts/behavior_config.md
docs/param_audit.md
docs/docs_index.md
docs/readme_devpanel.md
docs/03_execution/phaseb_execution_plan.md
docs/ichan_project_doc.md
docs/04_task_cards/active/B2-6_task_card_v1.2.md
```

禁止变更：

```text
src/services/notion-service.ts                  # 除非仅修 import 路径且不改接口；默认不碰
src/state/StateMachine.ts
src/integration/dialogStateBridge.ts
docs/01_contracts/interface_v1_2.md
```

---

## 12. 开放项分类

### 12.1 已决议项

- 决策 A：talking 中 reminder 不预先 dispatch `dialog.close`。
- 决策 B：queue 上限 3。
- 决策 C：DevPanel raw / simulate 双按钮分离。
- 决策 D：dialog gate = 500ms × 60 次。
- `TimedTodoWithDueAt` 放 scheduler 内部。
- 首轮 poll 立即执行，不延迟。

### 12.2 本卡不处理项

- ReminderBubble 后续精细 UI schema；如后续需要独立视觉真值源，再新建 `reminder_bubble_schema.md`。
- 跨天提醒、系统休眠精确补偿、多显示器增强、运行时配置热更新。

### 12.3 需 Claude 回弹项

无。
