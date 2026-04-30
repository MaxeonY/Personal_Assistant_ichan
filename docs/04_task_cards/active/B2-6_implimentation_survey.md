# B2-6 可行性调查报告
## 2.1 轮询基础设施现状
**现状**：
- `src/services/notion-service.ts`：纯请求-响应模式，无 polling 能力。`getTodayTimedTodos()` 是一次性 API 调用（`156-173`行），返回后即结束。
- 项目中仅有的定时器 precedent 在 TS 侧：
  - `App.tsx:591-644`：`window.setInterval` 驱动窗口位移 tick（16ms）
  - `App.tsx:1685-1687`：DevPanel 刷新 `window.setInterval`（120ms）
  - `src/state/timers.ts:29-97`：`StateMachineTimers` 基于 `window.setTimeout` chain（idle timeout / drowsy-to-nap / roaming tick）
- Rust 侧：`src-tauri/src/scheduler/mod.rs` 为空文件（0 字节）。`Cargo.toml` 无 `tokio` 依赖。无任何 Rust 定时器/调度代码。
**Gap**：B2-6 需要每 30 分钟轮询 Notion 的 `getTodayTimedTodos()`，当前不存在任何 polling 基础设施。
**推荐落地方案**：**在 TS 侧用 `window.setInterval` 实现 polling**。理由：NotionService 已在 TS 侧（`fetch` 调用）；现有所有 timer 基础设施（`TimerBackend` 接口、`StateMachineTimers` 封装）均为 TS；Rust 侧 scheduler 目录空，从零起建 Rust 定时器需引入 `tokio`、需通过 Tauri event 桥接前后端，增加不必要的复杂度。方案：在 `App.tsx` 的 `useEffect` 中启动 `setInterval`（`POLL_INTERVAL_MS = 30 * 60 * 1000`），每次 tick 调用 `notionService.getTodayTimedTodos(databaseId)`，结果送入内存队列。
## 2.2 frontTarget 坐标复用
**现状**：
- `App.tsx:228-253`：`resolveTargetX(rawTargetX, minX, maxX)` 是核心目标点计算函数。当 `rawTargetX` 为 `undefined` 时回退到 `TARGETED_DEFAULT_WORKAREA_X`（0.82，`petBehaviorConfig.ts:12`）。支持三种输入模式：像素坐标、[0,1]归一化、(-1,1)方向。
- `App.tsx:1338-1352`：`resolveDevReminderTarget()` 是为 DevPanel 写的轻量封装，手动复现了 `resolveTargetX` 的部分逻辑（`minX + span * TARGETED_DEFAULT_WORKAREA_X`）。
- `App.tsx:681`：`syncWindowMovementFromState` 调用 `resolveTargetX(nextState.movement.target?.x, ...)` 驱动 targeted_move。
- `StateMachine.ts:398-413`：`handleReminderDue` 直接使用传入的 `target: Coord`，不做坐标转换。转换由 App 层的 `syncWindowMovementFromState` 完成。
**Gap**：`resolveTargetX` 目前是 `App.tsx` 的私有函数（非 export）。scheduler 要生成 `reminder.due` 的 target，无法直接复用。
**推荐落地方案**：将 `resolveTargetX` 从 `App.tsx` 抽出为 `src/utils/windowTargetResolver.ts`（导出 `resolveTargetX` + `TARGETED_DEFAULT_WORKAREA_X` 常量）。scheduler 调用 `resolveTargetX(undefined, minX, maxX)` 即可获得 82% 工作区宽度位置。注意 scheduler 需要访问 `minX/maxX`（工作区边界），需通过 `App.tsx` 的 `movementRuntimeRef` 或单独调用 `currentMonitor()` 获取。考虑到 scheduler 可能与 `App.tsx` 的生命周期不完全一致，建议 scheduler 内部自行调用 `currentMonitor()` + `appWindow.outerSize()` 计算边界（复用 `refreshWindowMovementBounds` 的模式，`App.tsx:522-567`）。
## 2.3 dismiss UX 组件复用
**现状**：
- 项目无独立 Toast/气泡组件。当前唯一的短反馈机制是 `App.tsx:1845` 的 `<div className="pet-status">{status}</div>`——纯文本叠加层，定时自动消失，**不可交互、不可点击关闭**。
- `MessageBubble.tsx` 是对话 UI 内的消息气泡组件，嵌入在 `interactive_box` 中，不适用于提醒场景（依赖 Dialog 布局上下文）。
- 项目文档 §2.3 明确："提醒方式：宠物动画 + 对话气泡"。
**Gap**：提醒气泡需要是可点击 dismiss 的交互式气泡（区别于 auto-hide 的 pet-status 纯文本），存在宠物动画。pet-status 模式不可复用，MessageBubble 不可脱离 Dialog 上下文使用。
**推荐落地方案**：**新建 `src/components/Reminder/ReminderBubble.tsx`**。定位策略：用 `position: fixed` 相对于宠物窗口定位（参考 `pet-hitbox` 的尺寸与宠物 anchor 位置）。内容显示 `TimedTodo.title + reminderTime`，带 X 关闭按钮，点击后 dispatch `reminder.dismiss`。动画可用现有的 CSS transition 模式（opacity fade-in + translateY enter），参考 `DialogTransitionPhase` 的 timing 设计。不接入 Dialog 壳、不依赖 `interactive_box` 上下文。气泡定位参考 `COMPACT_PET_ANCHOR_IN_WINDOW`（`dialog-transition.ts`）的 anchor box 中心点。
## 2.4 dialogStateBridge 在 talking → reminding 路径的实际行为（关键）
**现状**（`src/integration/dialogStateBridge.ts:12-34`）：
```ts
prevMajor === 'talking' &&
nextState.major !== 'talking' &&
shouldBridgeCloseDialog()
```
**逐条件分析**：
1. `prevMajor === 'talking'` → talking → reminding 时满足
2. `nextState.major !== 'talking'` → reminding 的 major 为 `'reminding'`，满足
3. `shouldBridgeCloseDialog()` → 即 `dialogModeActiveRef.current && !dialogClosingInProgressRef.current`：talking 期间 UI 已打开，且未处于 closing 过程中 → 满足
**结论：talking → reminding 时，bridge **100% 会触发** UI 关闭。**
**触发后行为**（`App.tsx:1124-1138`）：
```ts
requestDialogClose({
  reason: 'user',
  dispatchStateEvent: false,   // ← 关键：不派发 dialog.close
  source: 'bridge',
});
```
- `dispatchStateEvent: false` → 不 dispatch `dialog.close` → 状态机**不**被切回 idle
- UI 关闭走 `runDialogCloseTransition` → 窗口几何回收 + unmount dialog
- 状态机保持 `major: 'reminding'`，宠物继续播 reminding 动画
**与决策 A 的对齐验证**：
| 决策 A 原文 | Bridge 行为 | 对齐 |
|-|-|-|
| "talking 期间 timed todo 到点，集成层直接派发 `reminder.due`" | scheduler dispatch `reminder.due` → StateMachine 切到 `reminding` | OK |
| "不预先 dispatch `dialog.close`" | bridge 的 `dispatchStateEvent: false` 确保不发送 `dialog.close` | OK |
| "UI 关闭由 dialogStateBridge 的 'talking → non-talking + UI 仍打开' 单向兜底接管" | bridge 检测到 talking→reminding 且 UI 打开，触发 UI close | OK |
**风险评估：零 gap。** Bridge 的判定条件 `!== 'talking'`（而非 `=== 'idle'`）恰好覆盖了 talking → reminding 路径。`dispatchStateEvent: false` 确保状态机不被回切。此路径已在 B2-9 实现时被验证过（测试用例 `talking + reminder.due → reminding + bridge triggers UI close` 在 `B2-9_implementation_details_v0.2.md:527` 标记为通过）。无需修改 bridge 条件，无需在 scheduler 中补发 `dialog.close`。
## 2.5 队列存活范围
**现状**：
- `src-tauri/src/scheduler/mod.rs` 为空文件，无任何队列实现。
- `ichan_project_doc.md` §2.3 描述："轮询间隔：每 30 分钟检查一次 Notion 待办"，未提及持久化或跨 session 恢复。
**Gap**：需要决定 scheduler 队列是内存实例还是持久化。
**推荐落地方案**：**内存队列，不持久化。** 理由：
1. Notion 是持久化数据源——重启后 scheduler 重新 `getTodayTimedTodos()` 即可恢复当天所有定时待办（含已过期的可补提醒或丢弃）
2. B2-6 是 MVP 最小存活范围，提醒是"当天有效"的短生命周期数据
3. 持久化需要新增 SQLite 表 + schema migration + 过期清理逻辑 → 超出 MVP 边界，且会引入 stale data 风险（上次 session 的未触发提醒在新 session 是否仍需触发？complication 远大于价值）
4. 决策 B 限定了"队列上限 3 条，超出直接丢弃并 log"——内存数组天然支持此约束
5. 项目文档 §2.3 未提及 remider 持久化需求
实现：`Scheduler` 类内部维护 `private queue: TimedTodo[] = []`，`maxSize = 3`，`enqueue` 超限时 `console.warn + return`。
## 2.6 TimedTodo 数据形态
**现状**（`src/types/notion-types.ts:38-42`）：
```ts
export interface TimedTodo {
  id: string;
  title: string;
  reminderTime: string; // HH:mm 格式（如 "14:30"）
}
```
`notion-service.ts:265-279` 的 `mapTimedTodo` 提取逻辑：从 Notion date property 的 `start` 读取 ISO 字符串（如 `"2026-04-30T14:30:00.000+08:00"`），通过 `toHHmm()` 转为 `HH:mm`，丢弃了日期和时区部分。
**Gap**：`reminderTime` 仅含 `HH:mm` 不含日期。Scheduler 要进行"是否到期"判定（`dueAt <= now`），需要能跟当前时间比较的完整时间戳。
**推荐落地方案**：**不修改 `TimedTodo` 类型，scheduler 侧自行计算 `dueAt`。** 理由：
1. `HH:mm` 足够——scheduler 知道 poll 的是"今天"的待办（`getTodayTimedTodos` 已过滤 `date: { equals: today }`），直接用 `new Date(`${todayISO}T${todo.reminderTime}:00`)` 构造成完整时间戳
2. 不改类型 = 不改 B0-3 已经冻结的 `NotionServicePort` 接口
3. 若在 service 层添加 `dueAt: ISO timestamp`，则每次 poll 返回的 timestamp 是 service 中计算出来的，不如在 scheduler 侧就近计算，职责更清晰
4. `mapTimedTodo` 可保留 `toHHmm` 的 `HH:mm` 输出以供 UI 气泡显示
具体：scheduler 中 `const dueAt = new Date(`${todayISO}T${todo.reminderTime}:00`).getTime()`，`todayISO` 通过 `toLocalDateIso(new Date())` 获取。
## 2.7 DevPanel 既有 reminder 注入
**现状**：
- `DevPanel.tsx:144` 已存在 "reminder.due" 按钮（位于 "Event Inject" 区域）。
- `App.tsx:1452-1454`：`handleDevInjectReminderDue` 的实现：
  ```ts
  dispatch({ type: 'reminder.due', target: resolveDevReminderTarget() });
  ```
  直接 dispatch，不经 Notion，不经 scheduler，target 用默认前台坐标。
**对比决策 C**：
| 决策 C | Phase A 现状 |
|-|-|
| "Force reminder.due (raw)" | **已存在**。`handleDevInjectReminderDue` 完全匹配 |
| "Simulate Notion timed todo" | **不存在**。需新增 |
**Gap**：缺少"构造假 TimedTodo 走完整 scheduler → dispatch 路径"的按钮。
**推荐落地方案**：
- **Force reminder.due (raw)**：无需改动，现有按钮保持不变。
- **Simulate Notion timed todo**：新增按钮 `onInjectSimulateTimedTodo`，handler 构造假 `TimedTodo`（`{id: "dev-001", title: "DEV测试提醒", reminderTime: "14:30"}`），送入 scheduler（若 queue 未满则 enqueue，触发串行处理，最终走到 scheduler 的 dispatch `reminder.due`）。注意：此按钮依赖 B2-6 实现的 scheduler 实例可用——应使用 `ref` 暴露给 App 层。若 scheduler 尚未实例化（如 Notion DB 未配置），模拟按钮应显示 toast "Scheduler not available"。
- DevPanel 按钮布局：在 "Event Inject" 区域内 `reminder.due` 旁边追加 "Simulate Timed Todo" 按钮。
## 汇总：风险矩阵
| 调查项 | 风险等级 | 关键问题 |
|-|-|-|
| 2.1 轮询 | 低 | TS `setInterval` 成熟方案，只需对接 `notionService.getTodayTimedTodos()` |
| 2.2 坐标复用 | 低 | `resolveTargetX` 代码已稳定，抽出即可 |
| 2.3 dismiss UX | 中 | 需新建组件，但参考 token 和设计规范充分 |
| **2.4 bridge 路径** | **无风险** | **Bridge 已完美实现决策 A，零 gap；无需任何修改** |
| 2.5 队列范围 | 低 | MVP 内存队列是正确选择 |
| 2.6 数据形态 | 低 | `HH:mm` + today date 足够，不改类型 |
| 2.7 DevPanel | 低 | 既有 raw 按钮保留，追加 simulate 按钮 |