# B2-6 调研指导
1. 架构层硬约束（不在调查范围）
任务定位：Phase B 第三层集成任务，依赖 B0-3 Notion Service。以下三条由架构层定稿，本次调查请视为前提：
决策 A — reminder.due 与 talking 优先级：talking 期间 timed todo 到点，集成层直接派发 reminder.due，不预先 dispatch dialog.close。UI 关闭由 dialogStateBridge 的"talking → non-talking + UI 仍打开"单向兜底接管。
决策 B — 多 reminder 并发：scheduler 维护未消费队列，串行处理（当前 dismiss 后再派发下一个）。队列上限 3 条，超出直接丢弃并 log。
决策 C — DevPanel 双按钮：

Force reminder.due (raw)：仅 dispatch，不经 Notion，target 用工作区默认前台坐标
Simulate Notion timed todo：构造假 TimedTodo 走完整 scheduler → dispatch 路径

接口边界已在 docs/03_execution/phaseb_execution_plan.md §2.6 定稿。复用既有 reminder.due / movement.arrive / reminder.dismiss。不新增 MajorState、不新增 PetEvent、不动状态机 public API。
2. 调查项（按节输出）
每项产出格式：现状（代码路径 + 行号 + 关键片段）→ gap（与 B2-6 需求差距）→ 推荐落地方案（≤200 字，基于现有代码风格而非通用工程偏好）。
2.1 轮询基础设施现状
src/services/notion-service.ts 是否已有 polling 能力？项目中既有的定时器/调度 precedent（TS setInterval / Rust tokio::time / 其他）位于何处？polling 应在 TS 侧还是 Rust 侧落地，给出代码层面理由。
2.2 frontTarget 坐标复用
targeted_move 的工作区目标点计算位于何处？（提示：src/App.tsx + petBehaviorConfig.ts 的 windowMovement.targetedDefaultWorkareaX）能否直接复用同一函数生成 reminder.due 的 target？需要抽离/包装吗？
2.3 dismiss UX 组件复用
项目是否已有"点击关闭气泡"组件？提醒气泡用既有 Toast Bubble 还是新建？给出代码层面对比。
2.4 dialogStateBridge 在 talking → reminding 路径的实际行为(关键)
读 src/integration/dialogStateBridge.ts。当主状态从 talking 切到 reminding(非 idle)时，bridge 的关闭判定是否会触发？如果它只判 idle，决策 A 就会出问题——这种情况下需要扩展 bridge 条件，还是集成层在 dispatch reminder.due 之前补一发 dialog.close？给出实际代码片段佐证。这一项是 B2-6 最高风险点，请深入。
2.5 队列存活范围
scheduler 队列内存实例 vs 持久化？应用在 reminding 中被关闭，下次启动是否要恢复未触发提醒？基于"MVP 最小存活范围"给推荐。参考 ichan_project_doc.md §2.3 对提醒功能的描述。
2.6 TimedTodo 数据形态
读 getTodayTimedTodos 实现及 TimedTodo 类型定义。字段是否够用于到期判定？是否需要补 dueAt: ISO timestamp？
2.7 DevPanel 既有 reminder 注入
DevPanel.tsx 中 reminder.due 按钮 Phase A 时期是否已存在？现有按钮是 raw 还是经 scheduler？需要重构还是只追加？
3. 不在调查范围

Notion API 鉴权与重试（B0-3 已闭合）
状态机 public API 设计（已锁定）
提醒气泡视觉设计（UI Schema 范畴）
Batch 3 晨间仪式（无依赖）
不要给任务卡草稿——你的产出是 GPT 写任务卡的输入