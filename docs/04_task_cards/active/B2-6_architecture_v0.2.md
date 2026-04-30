# B2-6 架构稿 v0.2（待办提醒功能）

> **定位**：6 阶段工作流的阶段 3 产出（架构层）
> **输入**：DeepSeek B2-6 可行性调研报告（2026-04-30）
> **下游**：DeepSeek 阶段 4 落地性预审 → GPT 起草任务卡 → 我做架构审定 → Codex 实施
> **状态**：待项目负责人审阅 + DeepSeek 阶段 4 校验

---

## 0. 既定决策（不在本稿讨论范围）

以下三条由前序架构决策定稿，本稿视为前提：

- **决策 A**：talking 期间 `reminder.due` 触发，集成层不预先派发 `dialog.close`，UI 关闭由 `dialogStateBridge` 单向兜底（DeepSeek 2.4 已实证验证 bridge 判定 `!== 'talking'` + `dispatchStateEvent: false` 完美覆盖此路径，零 gap）
- **决策 B**：scheduler 内存队列串行处理，上限 3 条，超出丢弃 + log
- **决策 C**：DevPanel 双按钮分离——`Force reminder.due (raw)` 仅 dispatch 不经 scheduler，`Simulate Notion timed todo` 走完整路径
- **决策 D**（决策 A 的实施补丁）：scheduler dispatch `reminder.due` 之前增加 dialog 门控；
  若 `dialogModeActiveRef.current === true`，延迟 500ms 重试，最多重试 60 次（30s）。
  超出后该条提醒静默丢弃 + 加入 `dismissedTodayIds` + log。

  > 决策 A 的精神（reminder 是硬打断、不预先 dispatch dialog.close）保留不变。
  > 决策 D 仅解决 DeepSeek 阶段 4 发现的"`syncWindowMovementFromState` 在 dialog
  > 关闭后不重跑"问题。彻底根治需修改 `finalizeDialogClose`，但会动 B2-9 刚稳定的
  > 代码，YAGNI——若未来出现其他"talking 期间需要 movement 的场景"，再开任务做根治。

---

## 1. 模块职责与边界

### 1.1 新增模块

| 模块 | 路径 | 职责 | 不做 |
|---|---|---|---|
| `ReminderScheduler` | `src/services/ReminderScheduler.ts` | Notion 轮询 + 队列管理 + dueAt 判定 + dialog 活跃门控 + `dispatch reminder.due` | 不做 UI 渲染、不做 Notion API 细节、不持有 React state |
| `ReminderBubble` | `src/components/Reminder/ReminderBubble.tsx` | 提醒气泡视觉、点击 dismiss | 不做调度判定、不持有队列状态 |
| `windowTargetResolver` | `src/utils/windowTargetResolver.ts` | 工作区目标点统一解析（从 App.tsx 抽出） | 不做窗口操作 |

### 1.2 修改模块

| 模块 | 修改内容 |
|---|---|
| `src/App.tsx` | 实例化 scheduler、抽出 `resolveTargetX`、挂载 `ReminderBubble`、接线 dismiss 回调 |
| `src/components/DevPanel/DevPanel.tsx` | 新增 `Simulate Notion timed todo` 按钮（既有 raw `reminder.due` 按钮保留不变） |

### 1.3 不动的模块（硬约束）

- `src/services/notion-service.ts`：B0-3 接口冻结
- `src/state/StateMachine.ts`：`reminder.due / movement.arrive / reminder.dismiss` 在 Phase A 已闭合
- `src/integration/dialogStateBridge.ts`：B2-9 已经把决策 A 需要的兜底装好
- `interface_v1_2.md`：不新增 `MajorState`、不新增 `PetEvent`、不动 `StateMachine` public API

---

## 2. 依赖图

```
┌───────────────────────────────────────────────────────────┐
│                       App.tsx                             │
│                                                           │
│  ┌──────────────────┐   poll    ┌──────────────────────┐  │
│  │ ReminderScheduler├──────────▶│ NotionService (B0-3) │  │
│  │   (singleton ref)│           └──────────────────────┘  │
│  │                  │                                     │
│  │  enqueue/        │   dispatch ┌──────────────────────┐ │
│  │  evaluate/       ├───────────▶│ StateMachine (PhA)   │ │
│  │  dispatch        │            └──────────────────────┘ │
│  │                  │                                     │
│  │  resolveTarget   │           ┌──────────────────────┐  │
│  │                  ├──────────▶│ windowTargetResolver │  │
│  └──────────────────┘           └──────────────────────┘  │
│         │                                                 │
│         │ activeReminder snapshot (via React state)       │
│         ▼                                                 │
│  ┌──────────────────┐                                     │
│  │ ReminderBubble   │ click X                             │
│  │ (条件挂载)        ├────▶ scheduler.dismiss()           │
│  └──────────────────┘                                     │
└───────────────────────────────────────────────────────────┘

DevPanel "Force reminder.due (raw)"   ─▶ dispatch 直接派发
DevPanel "Simulate Notion timed todo" ─▶ scheduler.devSimulate(fakeTodo)
```

**单向依赖原则**：
- Scheduler 依赖 NotionService、StateMachine.dispatch、windowTargetResolver
- Scheduler 不依赖 React、不直接 import `ReminderBubble`
- `ReminderBubble` 通过 props 接收 dismiss 回调，不反向 import scheduler

---

## 3. Scheduler 状态模型

### 3.1 内部状态

| 字段 | 类型 | 含义 |
|---|---|---|
| `queue` | `TimedTodoWithDueAt[]` | 待触发提醒队列（FIFO） |
| `dismissedTodayIds` | `Set<string>` | 当天已 dismiss 的 `todoId`，用于 enqueue 去重 |
| `activeReminder` | `TimedTodoWithDueAt \| null` | 当前正在 reminding 的项 |
| `pollTimerId` | `number \| null` | 30min poll setInterval id |
| `evaluateTimerId` | `number \| null` | 60s evaluate tick setInterval id |
| `status` | `'idle' \| 'polling' \| 'disabled'` | 调度器宏观状态 |
| `dialogGateRetryCount` | `number` | 当前 activeReminder 候选因 dialog 活跃被推迟的次数（上限 60） |
| `evaluateRetryTimerId` | `number \| null` | dialog 门控重试的 setTimeout id |

`queue` 上限 3（决策 B），超出 enqueue 调用直接 `console.warn` 并 skip。
`scheduler` 构造参数新增 getIsDialogActive: () => boolean，由 App.tsx 注入实现 () => dialogModeActiveRef.current。

### 3.2 状态转移规则

**enqueue 路径**（每轮 poll 完成后）：
1. 对 response 中每条 timed todo：
   - `todoId in dismissedTodayIds` → skip
   - `todoId === activeReminder?.todoId` → skip
   - `queue` 中已存在同 `todoId` → skip
   - `queue.length >= 3` → log + skip
   - 否则计算 `dueAt`，push 到 queue
2. 触发 `evaluate()`

**evaluate 路径**（poll 后 + dismiss 后 + 60s tick）：
1. `activeReminder !== null` → 不抢占，return
2. `queue` 为空 → return
3. 取 `queue[0]`，若 `dueAt > now` → return（等下次 tick）
4. 若 `dueAt <= now`：
   - **dialog 门控**：若 `getIsDialogActive() === true`：
     - `dialogGateRetryCount + 1`
     - 若 `dialogGateRetryCount > 60` → shift 出 queue + 加入 `dismissedTodayIds` + log
       "reminder dropped after 30s of dialog activity"  + reset retry count + return
     - 否则 `evaluateRetryTimerId = setTimeout(evaluate, 500)` + return
   - dialog 不活跃：reset `dialogGateRetryCount = 0`
   - shift 到 `activeReminder`
   - 计算 `target` via `windowTargetResolver`
   - dispatch `reminder.due { target }`

**dismiss 路径**（用户点击气泡 X 或 DevPanel `Force reminder.dismiss`）：
1. `activeReminder.todoId` 加入 `dismissedTodayIds`
2. `activeReminder = null`
3. dispatch `reminder.dismiss`
4. 触发 `evaluate()`（处理队列下一项）
5. dismiss 路径末尾追加：clearTimeout(evaluateRetryTimerId) + reset dialogGateRetryCount
6. destroy 路径同理增加 clearTimeout(evaluateRetryTimerId)。

**dayChange 路径**（60s tick 检测到日期变化）：
1. 清空 `dismissedTodayIds`
2. 立即触发一次 poll（不等 30min）

### 3.3 evaluate 触发源

| 触发源 | 时机 | 频率 |
|---|---|---|
| poll 完成 | enqueue 之后 | 30min |
| dismiss 之后 | 处理队列下一项 | 事件驱动 |
| 60s evaluate tick | 检测 `queue[0].dueAt` 是否到期 + 检测日期变化 | 60s |

> **设计说明**：60s tick 是必要的——poll 周期是 30min，但 todo 可能在两次 poll 之间到点。tick 周期 60s 能保证最大延迟 ≤60s 触发。

---

## 4. Scheduler 生命周期

### 4.1 启动条件

满足以下全部条件才实例化：
- `setup_completed === '1'`（B1-7 已完成）
- 能从 SQLite 读出非空 `notionToken` 和非空 `todoDbId`

任一条件不满足 → `scheduler = null`，不挂任何定时器，不访问 Notion。

### 4.2 启动序列

```
App.tsx mount
  ↓
读取 config(setup_completed, notionToken, todoDbId)
  ↓
配置完整？
  ├── No → scheduler 保持 null（disabled 状态由 ref 表达，不创建实例）
  └── Yes →
      ↓
      if (schedulerRef.current) return  // 幂等保护，应对 handlePlayerReady 二次触发
      new ReminderScheduler({
        notionService,                    // 既有实例
        dispatch: machine.dispatch,       // 现有 ref
        resolveTarget: windowTargetResolver,
        getWorkareaBounds: () => ...      // App.tsx 注入（理由见 §9 问题 3）
      })
      ↓
      scheduler.start()
        ├── 立即执行一次 poll（关键：不等 30min）
        ├── setInterval(poll, 30 * 60 * 1000)
        └── setInterval(evaluate, 60 * 1000)
```

### 4.3 销毁序列

App.tsx unmount → `scheduler.destroy()`：
- `clearInterval(pollTimerId)`
- `clearInterval(evaluateTimerId)`
- `queue / dismissedTodayIds` 清空
- 不主动 dispatch `reminder.dismiss`（让状态机保持当前态，进程退出由应用壳处理）

### 4.4 配置变更

MVP 阶段假设 `setup_completed` 后配置不再变化。运行时改 token / dbId 需要重启应用——属于 Phase B 范围外。

---

## 5. 错误处理矩阵

| 错误源 | 检测点 | 处理 | 用户感知 |
|---|---|---|---|
| `NotionServiceError.auth_failed` | poll | `console.error`；scheduler 转 `disabled`，停止 poll | 当天提醒不再触发 |
| `NotionServiceError.rate_limited` | poll | NotionService 已有指数退避（B0-3），透传 | 无 |
| `NotionServiceError.network` | poll | `console.warn`；本轮 poll 跳过；下轮继续 | 偶发延迟 |
| `NotionServiceError.db_not_found` | poll | `console.error`；scheduler 转 `disabled` | 同 auth_failed |
| Notion 返回空 | poll | 正常处理（queue 不变） | 无 |
| Notion 返回 bad data（缺字段） | enqueue | 单条 skip + log；不影响其它条 | 该条不提醒 |
| 工作区边界获取失败 | evaluate | fallback 默认坐标（屏幕中央） | 提醒位置不理想但能触发 |
| `dispatch` 抛异常 | evaluate | `console.error`；`activeReminder` 回退为 null；下个 evaluate tick 重试 | 提醒延迟一个 tick |
| 系统休眠 | setInterval | 不可保证准时（已知限制） | 唤醒后最多延迟 30min |
| dialog 持续活跃超过 30s（决策 D 重试上限） | evaluate | shift 出 queue + 加入 `dismissedTodayIds` + log | 该条提醒静默丢弃 |

**降级原则**：scheduler 出问题不能影响宠物核心行为。任何错误最坏结果是"当天提醒不工作"，不能让状态机出错或闪退。

---

## 6. ReminderBubble 挂载条件与气泡内容

### 6.1 挂载条件

React 渲染层判定（**4 条 AND**）：

```ts
mountReminderBubble =
     scheduler !== null
  && scheduler.activeReminder !== null
  && state.major === 'reminding'
  && state.movement.state === 'still'
```

各条解释：
- `scheduler !== null`：disabled 时绝对不挂
- `activeReminder !== null`：scheduler 内部状态门控
- `major === 'reminding'`：排除 `reminder.due` 已 dispatch 但还在 `targeted_move` 期间
- `movement.state === 'still'`：冗余但稳妥的双重保护

### 6.2 气泡内容

| 区域 | 内容 |
|---|---|
| 主标题 | `activeReminder.title`（截断 20 字） |
| 副标题 | `今天 {reminderTime}` |
| 关闭按钮 | × |

不显示备注、优先级、分类等扩展字段（B2-6 范围外）。

### 6.3 定位与样式

- 定位策略由 DeepSeek 阶段 4 基于 `dialog-transition.ts` 的 `COMPACT_PET_ANCHOR_IN_WINDOW` 给出具体坐标
- 不接入 Dialog 壳，独立 `position: fixed` 容器
- 进入/退出动画参考 `DialogTransitionPhase` 的 timing 风格（200~300ms 量级），具体值由阶段 4 定

### 6.4 事件传播约束

- X 关闭按钮的 click handler 调用 `event.stopPropagation()`
- 气泡其他区域**不**调用 stopPropagation（reminding 状态下宠物本就不响应
  pat/doubleClick，无需阻挡；保留气泡内容区未来扩展可点击交互的空间）


---

## 7. 已知限制（必须写入 GPT 任务卡的"已知限制"章节）

1. **`dismissedTodayIds` 不持久化**：应用重启后清空，当天已 dismiss 的提醒可能在重启后再次触发
2. **系统休眠唤醒后 polling 不准时**：`window.setInterval` 在系统休眠后行为不确定，最多延迟 30min
3. **不支持运行时修改 Notion 配置**：scheduler 启动后 token / dbId 变更需重启应用
4. **不处理跨天 timed todo**：`getTodayTimedTodos` 只返回今天的，跨天创建的明天提醒会因 enqueue 时机不在今天而漏触发——MVP 不解决
5. **多显示器适配复用现状**：sticky 在主显示器，参考 `targeted_move` 现有规则，不引入新策略
6. **talking 期间提醒延迟**：talking 中到点的 timed todo 会被推迟 500ms~30s 触发（取决于对话剩余时长）；用户对话超过 30s 时，该条提醒被静默丢弃（加入 `dismissedTodayIds`，下次 poll 仍会被 skip）

---

## 8. 架构层验收清单（GPT 任务卡 DoD 必须覆盖）

### 8.1 主路径
- 配置完整 + Notion 中有 14:30 timed todo + 当前时间 14:31 启动 → 立即首发 poll → enqueue 1 项 → evaluate 检测到 `dueAt` 已过 → dispatch `reminder.due` → 宠物 `targeted_move` 至前台 → 到达后 `reminding` + 气泡显示
- 用户点击气泡 X → `reminder.dismiss` → `activeReminder` 清空 + 加入 `dismissedTodayIds` → 宠物回 `idle.awake`
- 下轮 poll 同条 todo 仍在 response → 因 `dismissedTodayIds` 命中被 skip

### 8.2 决策 A + D 联合验证（关键）

主路径：
- talking 中 `reminder.due` 触发 → bridge 关 dialog UI（不 dispatch `dialog.close`）
- dialog 关闭完成（约 416ms）→ scheduler 下一轮 evaluate（≤500ms 内）检测到
  dialog 不活跃 → dispatch `reminder.due`
- 宠物正常 `targeted_move` 至前台 → 到达后 `reminding` + 气泡显示

边界路径：
- talking 持续 30s 以上的场景 → 验证 `dialogGateRetryCount` 增至 60 后该条提醒
  被静默丢弃 + log 输出 + 后续 poll 不会重新触发同条

### 8.3 决策 B 验证
- 同一轮 poll 返回 5 个 timed todos（`dueAt` 全部已过）→ queue 入前 3 个 + 后 2 个 `console.warn` 丢弃 → 串行触发：第一个 dismiss 后第二个才 dispatch

### 8.4 决策 C 验证
- DevPanel `Force reminder.due (raw)` → 不经 Notion / 不经 scheduler / 不入队列 / 不计入 `dismissedTodayIds`
- DevPanel `Simulate Notion timed todo` → 走完整 scheduler 路径 / dismiss 后入 `dismissedTodayIds` / 同条再 simulate 被 skip

### 8.5 错误降级
- Notion token 无效 → scheduler 转 `disabled` / 宠物正常运行 / 不弹错误 UI / DevPanel 状态显示 disabled
- 拔网线后 poll → 本轮跳过 / 接网后下轮恢复

### 8.6 边界
- queue 满 3 条时第 4 条被丢弃 + log
- 应用重启后 `dismissedTodayIds` 清空
- 跨 0 点 → `dismissedTodayIds` 清空 + 立即 poll（不等 30min）

---

## 9. 变更记录

### v0.1 → v0.2（2026-04-30）

输入：DeepSeek B2-6 阶段 4 落地性预审报告

接受的方案（Q1, Q2, Q3, Q4, Q5, Q7）：
- Q1：scheduler 在 `handlePlayerReady` 末尾、`machineReadyRef.current = true`
  之后异步初始化（架构稿 §4.2 修订 5 增加幂等保护）
- Q2：ReminderBubble 渲染于 `pet-hitbox` 内、`PetCanvas` 之后，与
  `pet-status` 平级（架构稿 §6.4 修订 7 补充 stopPropagation 约束）
- Q3：抽出 `getWorkareaBounds()` 注入 scheduler，不与
  `refreshWindowMovementBounds` 共享（不写入 `movementRuntimeRef`）
- Q4：`setInterval(60 * 1000)`，destroy 时 `clearInterval`
- Q5：`Set<string>`，未来如需"dismiss N 小时后再提醒"再升级 Map
- Q7：`TimedTodoWithDueAt extends TimedTodo` 定义在
  `src/services/ReminderScheduler.ts` 内部，不入 `notion-types.ts`

新增决策 D（Q6 推论）：
- 阶段 4 逐帧追踪发现 talking → reminding 路径下 `syncWindowMovementFromState`
  不会在 dialog 关闭后重跑，导致宠物动画播放但窗口不动（100% 重现）
- 采取"scheduler 侧延迟 dispatch + dialog 门控 + 500ms × 60 次重试"作为局部
  兜底（架构稿 §0、§3.1、§3.2、§5 修订 1/3/4/6 落地）
- 根治方案（修改 `finalizeDialogClose` 主动重跑 movement sync）作为 backlog，
  B2-6 不做

否决项：
- Q1 风险提示 #2 提到的"hungry 判定 + scheduler 首轮 poll 并发可能触发 Notion
  rate limit"——hungry 判定调用的是 `PetContextService.getLastCsvImportDate()`
  读取本地 SQLite，不涉及 Notion API，不存在并发冲突。首轮 poll 立即执行，
  不延迟。
---

## 10. 不在本稿范围

- ReminderBubble 的 CSS / 视觉细节（属 UI Schema 层，B2-6 落地后回流到 `02_ui_schema/reminder_bubble_schema.md`，由阶段 4 + GPT 任务卡协同定）
- Scheduler 单元测试边界（属阶段 4 + GPT 任务卡）
- Codex 实施细节（文件改动清单、测试命令、构建命令）