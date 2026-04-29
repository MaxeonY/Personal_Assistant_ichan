# Phase B Execution Plan


> 版本：
  > v2.1 - 2026.04.24 - Merged v1+v2
  > v2.2 - 2026.04.24 - B0-1 Finished
  > v2.3 - 2026.04.24 - B0-3 Finished
  > v2.4 - 2026.04.24 - B0-11 Finished
  > v2.5 - 2026.04.25 - 新增B2-12（任务13）跨章节对齐；新增B0-8 任务日志
  > v2.6 - 2026.04.25 - 新增B1-4任务日志
  > v2.7 - 2026.04.25 - 修正 B0-12→B2-13 命名 + 锁定 B1 执行序列
  > v2.8 - 2026.04.25 - 新增 B1-7 任务日志（首次启动配置向导）
  > v2.9 - 2026.04.26 - 新增 B1-10 任务日志（interactive_box + 问题修复链）
  > v2.10 - 2026.04.27 - 审计同步：§3.2.2 标记 10(Done✅)
  > v2.11 - 2026.04.27 - 文档落地对齐：补建 notion_schema + 引用一致化
  > v2.12 - 2026.04.27 - 新增 B1-10A 任务日志（anchor 过渡重构 + callback 稳定性修复）
  > v2.13 - 2026.04.29 - 新增 B2-13 任务日志（chat 历史 FTS5 关键词记忆库）
> 范围：规划方案及对应实现细则

## 第1章：任务全景与分层

### 1.1 三层定义
- 第一层：纯服务/功能（不涉及 UI，可独立开发测试）
- 第二层：交互/UI 设计（需定稿形态和规则，可用 mock 验证）
- 第三层：集成（把服务接到 UI，通过状态机串起来）

### 1.2 Backlog 分层表（12项）

| 编号 | 任务 | 层级 | 性质 | 依赖（编号） | 说明 |
|---|---|---|---|---|---|
| 1 | Workout CSV 解析 + SQLite 存储 | 第一层 | 纯功能 | - | 建立导入、去重、落库、查询闭环 |
| 2 | CSV 拖拽投喂交互 | 第二层 | 纯交互 | 1 | 负责拖拽输入、格式校验、反馈 |
| 3 | Notion Service 模块 | 第一层 | 纯功能 | - | 提供待办与晨间上下文数据访问 |
| 4 | DeepSeek Service 模块 | 第一层 | 纯功能 | 8 | 基于人格 Prompt 提供文案与对话接口 |
| 5 | 晨间仪式完整流程 | 第三层 | 混合 | 1,3,4,7,8,9,10,11 | 服务+状态机+对话UI 端到端闭环 |
| 6 | 待办提醒功能 | 第三层 | 混合 | 3 | Notion 定时待办触发提醒链路 |
| 7 | 首次启动配置向导 | 第二层 | 混合 | - | 采集 token/DB ID 等配置并持久化 |
| 8 | 宠物人格 Prompt 设计 | 第一层 | 纯功能 | - | 形成可版本化 Prompt 资产 |
| 9 | talking 正常退出机制闭合 | 第三层 | 混合 | 4,10,11 | 补齐 talking 从 loop 到正常退出 |
| 10 | 对话 UI 系统（interactive_box） | 第二层 | 纯交互 | 11 | 对话壳、淡出、回看模式 |
| 11 | 对话记录 SQLite schema | 第一层 | 纯功能 | - | 消息历史存储与分页读取 |
| 12 | hungry 自动判定逻辑 | 第一层 | 纯功能 | 1 | 基于 `lastCsvImportDate` 自动判定 hungry |
| 13 | chat 历史 FTS5 关键词记忆库 | 第一层 | 纯功能 | 11 | 实现 ChatMemoryStore，为 chat() 提供长期记忆召回 |

### 1.3 兼容性边界（不改动项）
- `MajorState` 固定五态：`idle | talking | eating | happy | reminding`。
- hungry 始终是 `PetFullState.flags.isHungry` 对应 overlay/flag，不并入 `MajorState`。
- `StateMachine` 公共接口维持：`init/start/dispatch/getState/getSnapshot/subscribe/destroy`。
- `PetEvent` 已有语义不改写；如需新增事件，一律标注“候选 PetEvent 扩展（Phase B 提案）”。
- `targeted_move -> movement.arrive` 闭环语义保持不变。

---


## 第2章：每项任务的接口边界草案

### 2.0 对接基线（interface_v1_2）

```ts
type MajorState = 'idle' | 'talking' | 'eating' | 'happy' | 'reminding';

interface PetFullState {
  major: MajorState;
  flags: { isHungry: boolean };
}

type PetEvent = /* existing union in interface_v1_2 */;

interface StateMachine {
  dispatch(event: PetEvent): void;
  getState(): Readonly<PetFullState>;
}
```

```ts
// 候选 PetEvent 扩展（Phase B 提案，非既有契约）
type PhaseBPetEventProposal =
  | { type: 'dialog.open'; source: 'shortcut' | 'doubleClick' | 'morningRitual' }
  | { type: 'dialog.close'; reason: 'user' | 'timeout' | 'service_done' | 'error' }
  | { type: 'morningRitual.complete' };
```

### 2.1 任务1：Workout CSV 解析 + SQLite 存储

```ts
interface WorkoutCsvImportInput {
  filePath: string;
  importedAtIso: string;
}

interface WorkoutCsvImportOutput {
  result: ImportResult;
  lastCsvImportDate: string; // YYYY-MM-DD
}
```

- 对接点：`PetContext.lastCsvImportDate`、`dispatch({ type: 'hungry.set', value: false })`（导入成功后）。
- 状态机影响：复用现有 `user.feed` / `hungry.set`；不新增状态。

### 2.2 任务2：CSV 拖拽投喂交互

```ts
interface CsvDropInput {
  filePath: string; // native path from Tauri onDragDropEvent payload.paths[0]
  source: 'drag_drop';
}

interface CsvDropOutput {
  accepted: boolean;
  rejectReason?: 'not_csv' | 'empty_file' | 'io_error';
}
```

- 注：B1-2 实施层使用 native `filePath`，`File` 仅作为 `dispatch({ type: 'user.feed', csv })` 的占位对象，不参与 CSV 读取。
- 对接点：UI 层并行执行两条路径：`WorkoutService.importCSV(filePath)`（数据处理）与 `dispatch({ type: 'user.feed', csv: placeholderFile })`（状态转换）。
- 状态机影响：复用既有 eating 链路；无新增。

### 2.3 任务3：Notion Service 模块

```ts
interface NotionServiceConfig {
  apiToken: string;
  todoDbId: string;
  researchDbId: string;
  // Todo DB 同时承担 Daily Plan 职责
}

interface ResearchLog {
  id: string;
  title: string;
  author?: string;
  venueTier?: string;
  readingStatus?: string;
  fields?: string[];
  priority?: string;
  date: number; // 发表年份
  // 摘要在页面正文，本阶段不读取
}

interface DailyPlan {
  date: string;
  items: { title: string; priority: 'high' | 'medium' | 'low' }[];
  sleepNote?: number; // 0-10
}

interface NotionServicePort {
  getYesterdayTodos(databaseId: string): Promise<TodoItem[]>;
  getLatestResearchLog(databaseId: string): Promise<ResearchLog | null>;
  createDailyPlan(databaseId: string, plan: DailyPlan): Promise<string>;
  getTodayTimedTodos(databaseId: string): Promise<TimedTodo[]>;
}

class NotionServiceError extends Error {
  constructor(
    public code: 'auth_failed' | 'rate_limited' | 'db_not_found' | 'network' | 'unknown',
    message: string
  ) {
    super(message);
  }
}
```

- 对接点：为任务5/6提供输入；与 `StateMachine` 仅通过集成层连接。
- 状态机影响：无直接变更。
- 字段真值源：`docs/01_contracts/notion_schema.md`。

### 2.4 任务4：DeepSeek Service 模块

```ts
interface DeepSeekInput {
  messages: ChatMessage[];
  systemPrompt: string;
  scene: 'morning_ritual' | 'workout_reminder' | 'chat';
}

interface DeepSeekOutput {
  text: string;
  doneHint?: 'continue' | 'conversation_done';
}
```

- 对接点：复用 `DeepSeekService.generateMorningReview/generateWorkoutReminder/chat` 口径。
- 状态机影响：状态机不直接感知 `doneHint`；由集成层消费 `doneHint`。当 `conversation_done` 时，集成层派发 `dispatch({ type: 'dialog.close', reason: 'service_done' })`（候选事件提案），见任务9。

### 2.5 任务5：晨间仪式完整流程

```ts
interface MorningRitualFlowInput {
  context: MorningContext;
  sleepReport: string;
}

interface MorningRitualFlowOutput {
  reviewText: string;
  createdPlanPageId?: string;
  completedAt: string;
}
```

- 对接点：`morningRitual.complete` 归类为“候选 PetEvent 扩展（Phase B 提案）”；流程完成后由集成层派发该事件，并更新 `PetContext.lastMorningRitualDate`。
- 状态机影响：不改 `MajorState` 定义；完成后按既有规则回 `idle.awake`。

### 2.6 任务6：待办提醒功能

```ts
interface ReminderSchedulerInput {
  nowIso: string;
  timedTodos: TimedTodo[];
  frontTarget: Coord;
}

interface ReminderSchedulerOutput {
  dueItems: Array<{ todoId: string; target: Coord }>;
}
```

- 对接点：现有 `PetEvent`：`reminder.due`、`movement.arrive`、`reminder.dismiss`。
- 状态机影响：复用既有 `reminding/targeted_move` 链路；无新增。

### 2.7 任务7：首次启动配置向导

```ts
interface FirstRunWizardInput {
  requiredKeys: Array<'notionToken' | 'todoDbId' | 'researchDbId' | 'deepseekApiKey'>;
}

interface FirstRunWizardOutput {
  saved: boolean;
  configVersion: string;
}
```

- 对接点：配置写入本地 `config`（SQLite）；供任务3/4初始化读取。
- 状态机影响：不强依赖新增 `PetEvent`；属于 `start(...)` 前置 gating。

### 2.8 任务8：宠物人格 Prompt 设计

```ts
interface PersonaPromptInput {
  petName: string;
  tone: 'cute' | 'energetic' | 'gentle';
  maxChars: number;
}

interface PersonaPromptOutput {
  systemPrompt: string;
  promptVersion: string;
}
```

- 对接点：作为 `DeepSeekService.chat(...)` 默认 system prompt。
- 状态机影响：无。

### 2.9 任务9：talking 正常退出机制闭合

```ts
interface TalkingExitDecisionInput {
  inactivityMs: number;
  userAction?: 'send' | 'close_button' | 'esc' | 'shortcut';
  doneHint?: 'continue' | 'conversation_done';
}

interface TalkingExitDecisionOutput {
  shouldClose: boolean;
  reason: 'user' | 'timeout' | 'service_done' | 'error';
}
```

- 对接点：`MajorState.talking`、`StateMachine.dispatch(...)`。
- 状态机影响：
  - 现状：talking 仅 loop。
  - 提案：候选事件 `dialog.close` 触发 `talking -> idle.awake`。
  - 约束：不新增 `MajorState`。

### 2.10 任务10：对话 UI 系统（interactive_box）

```ts
interface InteractiveBoxOpenInput {
  source: 'shortcut' | 'doubleClick' | 'morningRitual';
  windowExpandedSize: { width: number; height: number };
}

interface InteractiveBoxActionOutput {
  action: 'send' | 'close' | 'scroll_review';
  text?: string;
}
```

- 对接点：入口来自 `Ctrl+Alt+T` / `user.doubleClick` / 晨间仪式；消息发送到任务4；历史读任务11。
- 状态机影响：UI 不新增状态；进入/退出 talking 由事件桥接（复用现有或候选提案）。

### 2.11 任务11：对话记录 SQLite schema

```ts
interface ChatMessageRecord {
  id?: number;
  sessionId: string;
  role: 'ichan' | 'user' | 'system';
  content: string;
  createdAtIso: string;
}

interface ChatHistoryStore {
  append(record: ChatMessageRecord): Promise<void>;
  listBySession(sessionId: string, cursor?: number, limit?: number): Promise<ChatMessageRecord[]>;
  listRecent(limit: number): Promise<ChatMessageRecord[]>;
}
```

- 对接点：任务10的回看模式读取；任务9会话关闭记录 reason。
- 状态机影响：无。

### 2.12 任务12：hungry 自动判定逻辑

```ts
interface HungryDecisionInput {
  lastCsvImportDate: string; // from PetContext
  nowDate: string;           // YYYY-MM-DD
  thresholdDays: number;     // default 3
}

interface HungryDecisionOutput {
  isHungry: boolean;
  daysSinceFeed: number;
}
```

- 对接点：`PetContext.lastCsvImportDate`、`dispatch({ type: 'hungry.set', value })`、`PetFullState.flags.isHungry`。
- 状态机影响：严格复用 `hungry.set`；不新增状态。

---

### 2.13 任务13：chat 历史 FTS5 关键词记忆库

​```ts
interface ChatMemoryQuery {
  currentUserMessage: string;
  recentTurns: number;       // default 6
  recallTopK: number;        // default 3
  excludeSessionId?: string; // 不召回当前会话
}

interface ChatMemoryResult {
  recalled: ChatMessageRecord[]; // FTS 召回的相关历史片段
  recentWindow: ChatMessageRecord[]; // 最近 N 轮窗口
}

interface ChatMemoryStore {
  buildIndex(): Promise<void>; // 首次启动 / schema 升级时构建 FTS5 虚表
  query(input: ChatMemoryQuery): Promise<ChatMemoryResult>;
}

// getChatContext() 拼装顺序由集成层负责：
// [recalled with "以下是相关历史" 前缀] + [recentWindow] + [本次 user]
​```

- 对接点：消费任务11 的 `chat_messages` 表；为任务4 的 `chat()` 提供 `getChatContext()` 实现替身。
- 关键词提取：本阶段用 jieba-rs（Rust 侧）或前端 segmentit；不上 embedding。
- 状态机影响：无；属于服务层增强。
- 字段真值源：`docs/01_contracts/docs/01_contracts/persona_prompt_spec.md` §3.3「getChatContext() 分阶段实现」。

---

## 第3章：依赖图与推荐执行顺序

### 3.1 文本依赖图

```text
8 -> 4
1 -> 2
1 -> 12
3 -> 6
11 -> 10
4 -> 9
10 -> 9
7 -> 5
1,3,4,7,8,9,10,11 -> 5
11 -> 13
```

### 3.2 推荐执行批次

#### 3.2.1 Batch 0：契约与底座
- 范围：1(Done✅),3(Done✅),8(Done✅),11(Done✅)
- 目标：先完成可独立测试的服务与存储底座。
- 输入：`interface_v1_2` 契约、现有模块接口定义。
- DoD：
  - CSV 导入与去重可用；
  - Notion 读写接口稳定；
  - Prompt 模板可版本化；
  - 对话历史库可写可读。

#### 3.2.2 Batch 1：服务并行 + 交互壳
- 范围：2(Done✅),4(Done✅),7(Done✅),10(Done✅),12(Done✅)
- 目标：并行完成 DeepSeek 服务、hungry 判定、首启向导与对话/投喂交互壳。
- 输入：Batch 0 产出。
- 推荐执行序列：4 → 7 → 10 → 12 → 2（依据：先 spec 落地的服务（4），
  再配置向导消除重复输入（7），随后对话 UI 完成 e2e 视觉验收（10），
  最后饥饿判定 → CSV 投喂构成 problem→solution 演示对（12 → 2）。）
- DoD：
  - 拖拽 CSV 可触发 `user.feed` 且服务导入链路可运行；
  - DeepSeek 服务可返回文本与 `doneHint`；
  - 首启向导可保存配置并重入；
  - interactive_box 完成输入、显示、淡出与回看模式；
  - hungry 自动判定可按阈值输出并驱动 `hungry.set`。

#### 3.2.3 Batch 2：状态闭环 + 长期记忆增强
- 范围：6,9,13(Done✅)
- 目标：聚焦提醒闭环、talking 正常退出闭环；并落地 chat 历史 FTS5 召回。
- 输入：Batch 0/1 产出。
- DoD：
  - `reminder.due -> targeted_move -> movement.arrive -> reminding -> dismiss` 正常；
  - talking 具备正常退出路径（候选 `dialog.close` 事件提案落地后）；
  - `ChatMemoryStore.query()` 在测试用对话历史上能返回相关召回片段，集成到 `getChatContext()` 后 chat 输出能引用历史信息。

#### 3.2.4 Batch 3：端到端集成
- 范围：5
- 目标：晨间仪式完整链路通过。
- 输入：Batch 0/1/2 全部产出。
- DoD：
  - 启动触发晨间仪式；
  - Notion/Workout/DeepSeek 数据整合、文案生成、计划写回闭环；
  - 对话 UI 与状态回归一致，无悬挂 talking/hungry 误态。
---


## 第4章：对话 UI 方案摘要

以下方向为架构层已定结论，直接落地：

- 同窗口扩展方案（非独立窗口），触发时窗口 `set_size` 扩大。
- `interactive_box` 包含：宠物动画区 + `ichan_message` 气泡 + `my_message` 气泡（绿边框）+ `message_box` 输入框 + `sent` 按钮。
- 活跃消息数秒后淡出，滚轮触发回看模式（从 SQLite 读历史）。
- 日常态仍用 Toast Bubble 处理短反馈。
- 触发入口：`Ctrl+Alt+T` / 双击宠物 / 晨间仪式自动触发。

---

## 第5章：批次执行细则

### 5.1 B0-1

执行范围与对应任务

- 执行批次：Batch 0
- 对应任务：任务1（Workout CSV 解析 + SQLite 存储）
- 范围：
  - 实现 Hevy CSV 导入、去重、SQLite 落库；
  - 提供最近一次训练摘要与按部位训练间隔查询；
  - 打通服务层与 Tauri 命令层闭环。
- 非范围：
  - 不涉及 UI 代码；
  - 不直接调用状态机；
  - 不新增 PetEvent / MajorState。

#### 5.1.1 实施方法

- 采用“TS 服务封装 + Tauri Rust 命令 + SQLite 本地库”三段式实现。
- CSV 读取先走 UTF-8（含 BOM），失败时回退 GB18030，提升 Hevy 导出编码兼容性。
- 导入路径使用事务写入，避免 session/sets 局部写入导致脏数据。
- 查询路径拆分为：
  - 最近训练摘要 `getLastWorkout()`；
  - 部位训练间隔 `getBodyPartRecency()`。
- 错误处理统一为返回值承载，不向上抛出未处理异常。

#### 5.1.2 改动清单

- 新增：`src/services/WorkoutService.ts`
  - `importCSV(filePath: string): Promise<WorkoutCsvImportOutput>`
  - `getLastWorkout(): Promise<WorkoutSummary | null>`
  - `getBodyPartRecency(): Promise<BodyPartRecency[]>`
  - 失败策略：`importCSV` 返回 `result.error`；查询失败返回 `null` / `[]`。
- 实现：`src-tauri/src/workout/mod.rs`
  - 命令：`workout_import_csv` / `workout_get_last_workout` / `workout_get_body_part_recency`
  - 去重：`(start_time + title)`，重复 session 跳过不覆盖
  - SQLite：`workout_sessions` + `workout_sets` + `idx_*` 索引 + `ux_sessions_start_title` 唯一索引
- 接线：
  - `src-tauri/src/lib.rs` 注册 workout 命令
  - `src-tauri/permissions/workout/default.toml` 新增权限
  - `src-tauri/capabilities/default.json` 挂载 `allow-workout-*`
- 依赖：
  - `src-tauri/Cargo.toml` 新增 `rusqlite`、`csv`、`chrono`、`encoding_rs`

#### 5.1.3 测试执行与结果

- `cargo test`：5/5 通过
  - `parse_csv_collects_sessions_and_sets`：11 sessions 样例可解析
  - `import_dedup_skips_existing_sessions`：重复导入新增 0，`duplicates=11`
  - `parse_empty_or_invalid_csv_returns_error_or_empty`：空/坏 CSV 返回明确错误或空结果
  - `latest_workout_and_recency_queries_work`：最近训练摘要与部位间隔查询正确
  - `helper_outputs_expected_values`：辅助逻辑输出正确
- `cargo check`：通过
- `pnpm exec tsc --noEmit`：通过

#### 5.1.4 最终结论与项目负责人验收方法

- 最终结论：
  - B0-1 已达“可集成”状态；
  - 可进入 Batch 1 对接任务2（CSV 拖拽投喂交互）与任务12（hungry 自动判定逻辑）。
- 冻结约束保持：
  - 导入成功后由集成层执行 `dispatch({ type: 'hungry.set', value: false })`；
  - 服务层不直接调用状态机。
- 项目负责人验收方法：
  - 核对接口可用性：三项 API 返回契约与错误返回策略是否符合文档；
  - 复测去重：同一 CSV 二次导入新增为 0，历史数据不覆盖；
  - 复测查询：`getLastWorkout` 与 `getBodyPartRecency` 返回结构与语义正确；
  - 审核链执行：自测 → 项目负责人验收 → 架构问题升级 Claude。

---

### 5.2 B0-3

执行范围与对应任务

- 执行批次：Batch 0
- 对应任务：任务3（Notion Service 模块）
- 当前状态：已实施（不含真网联调）

#### 5.2.1 实施方法

前端服务 `src/services/notion-service.ts` 直接通过 `fetch` 连接 Notion API（`https://api.notion.com/v1`），固定请求头 `Notion-Version: 2022-06-28`。鉴权 Token 默认从本地 SQLite 配置表读取（Tauri 命令 `config_get_value`，key=`notionToken`），并支持注入 `tokenProvider` 以复用到一次性验证脚本。

服务对外暴露四个方法：
- `getYesterdayTodos(databaseId)`：获取昨日计划页中的 `to_do` 子项（从页面 children 读取并扁平化返回）
- `getLatestResearchLog(databaseId)`：获取最新研究日志
- `createDailyPlan(databaseId, plan)`：创建每日计划
- `getTodayTimedTodos(databaseId)`：获取今日含提醒时间的待办

每次请求若返回 429，执行指数退避重试，最多 3 次。所有异常统一封装为 `NotionServiceError`，错误类型包括 `auth_failed`、`rate_limited`、`db_not_found`、`network`、`unknown`。数据库字段名以硬编码常量管理：
- Todo DB：每日待办、完成状态、日期、提醒时间、睡眠评分、分类、优先级
- Research DB：论文标题、发表年份、作者（仅一作）、期刊/会议级别、阅读状态、研究领域、优先级

读取口径补充（联调修正）：
- `getYesterdayTodos` 已由“读取数据库行 properties”修正为“读取昨日计划页 children 中的 `to_do` blocks”；
- 返回结果中的 `status` 由 `to_do.checked` 推导（`true => done`，`false => not_started`），与 `createDailyPlan` 写入路径保持对称。

每日计划写入策略：
- 在 Todo DB 中新建一行，标题为 `{date} 计划`
- 计划待办项以 `to_do` block 写入页面 children
- `sleepNote` 写入“睡眠评分” number 属性

类型定义位于 `src/types/notion-types.ts`，并与实现对齐：
- `NotionServiceConfig`：`apiToken`、`todoDbId`、`researchDbId`（无 `dailyPlanDbId`）
- `ResearchLog`：`date: number`，可选 `author`、`venueTier`、`readingStatus`、`fields`、`priority`
- `DailyPlan.sleepNote?: number`
- `NotionServiceError` class 与 `NotionServicePort` interface

SQLite 配置逻辑实现于 `src-tauri/src/notion/mod.rs`，使用最小表结构 `config(key TEXT PRIMARY KEY, value TEXT)`，并自动确保 schema 存在（数据库文件位于 `app_data_dir/app.sqlite`）。对外提供 `config_get_value` 与 `config_set_value`，供 Notion 及后续 DeepSeek 模块共用。

Tauri 侧在 `src-tauri/src/lib.rs` 注册上述命令，并在 `src-tauri/permissions/config/default.toml` 声明权限 `allow-config-get-value` 与 `allow-config-set-value`。`tauri.conf.json` 当前 `security.csp = null`，无需额外配置即可直连 `api.notion.com`。

另新增一次性验证脚本 `scripts/verify-notion.ts`（`npx tsx` 运行），按固定 5 步输出：
1. `getYesterdayTodos`（`console.table`）
2. `getTodayTimedTodos`（`console.table`）
3. `getLatestResearchLog`（`console.log`）
4. `createDailyPlan`（打印创建 page id）
5. 无效 Token 场景（捕获并输出 `NotionServiceError.code`）

#### 5.2.2 改动清单

| 文件 / 资源 | 变更类型 | 说明 |
|------------|---------|------|
| `src/services/notion-service.ts` | 新增 | Notion API 前端服务实现 |
| `src/types/notion-types.ts` | 补充调整 | 补充 `NotionServiceConfig`、`ResearchLog`、`DailyPlan.sleepNote`、`NotionServiceError`、`NotionServicePort` |
| `scripts/verify-notion.ts` | 新增 | 一次性 Notion 真网验证脚本（5 步核验输出） |
| `src-tauri/src/notion/mod.rs` | 新增 | SQLite 配置表及 `config_get_value` / `config_set_value` 命令 |
| `src-tauri/src/lib.rs` | 修改 | 注册 config 命令 |
| `src-tauri/permissions/config/default.toml` | 新增 | 声明 config 权限 |
| `tauri.conf.json` | 无需修改 | 现有 CSP 为 null，满足直连要求 |

联调后增补修正：
- `src/services/notion-service.ts`：`getYesterdayTodos` 调整为读取页面 `to_do` 子项（`/blocks/{page_id}/children`），不再仅依赖数据库行 properties。

#### 5.2.3 测试执行与结果

- `pnpm exec tsc --noEmit`：通过（前端类型检查无错误）
- `cargo check`：通过（Rust 编译检查无错误）
- `cargo test`：通过（含新增单测 `notion::tests::config_table_schema_creates_successfully`，验证 config 表自动建表逻辑）
- `scripts/verify-notion.ts`：未在本地执行真网联调（当前环境无真实 Notion Token / DB ID），保留到项目负责人验收阶段。

#### 5.2.4 最终结论与项目负责人验收方法

- 最终结论：
  - B0-3 已按架构决策落地，前端服务、类型定义、SQLite 配置层与 Tauri 权限接线已完成；
  - 本地静态检查与 Rust 单测通过，可进入集成验收。
- 约束保持：
  - 不涉及 UI；
  - 不直接调用 StateMachine；
  - 不新增 PetEvent / MajorState。
- 审核链：
  - Codex 自测 → 项目负责人验收 → 架构问题升级 Claude。
- 项目负责人验收方法：
  1. 将真实 Notion Token 写入 SQLite config（key=`notionToken`，通过 `config_set_value`）。
  2. 用环境变量执行：`NOTION_TOKEN=xxx TODO_DB_ID=xxx RESEARCH_DB_ID=xxx npx tsx scripts/verify-notion.ts`。
  3. 逐项核对脚本 1-4 步输出与 Notion 实际数据（昨日待办、今日定时待办、最新科研日志、新建计划页面）。
  4. 用无效 Token 复跑第 5 步，确认输出 `NotionServiceError.code = auth_failed`。
  5. 验收通过后手动删除测试计划页面。

---

### 5.3 B0-11

执行范围与对应任务

- 执行批次：Batch 0
- 对应任务：任务11（对话记录 SQLite schema）
- 范围：
  - 实现 `chat_messages` 表落库能力与索引；
  - 实现消息写入、按会话分页读取、最近消息读取；
  - 提供 TS 侧 invoke 薄封装；
  - 完成 Rust 单元测试覆盖自测清单。
- 非范围：
  - 不涉及 UI 代码；
  - 不涉及 StateMachine 调用；
  - 不新增 PetEvent / MajorState。

#### 5.3.1 实施方法

- 采用与 B0-1 一致的 Rust `rusqlite` 路径，TS 仅做 invoke 薄封装。
- 与 workout 共用同一个数据库文件（`workout.sqlite`），不新增独立数据库。
- 在现有 `workout` 初始化 schema 中追加 `chat_messages` 表与 `idx_chat_*` 索引；`chat` 模块初始化时复用同一份共享 schema。
- 新增 Tauri 命令：
  - `chat_append_message`
  - `chat_list_by_session`（`id DESC` + cursor 分页）
  - `chat_list_recent`（`id DESC`）
- 权限接线遵循现有模式：新增 `permissions/chat/default.toml` 并在 `capabilities/default.json` 挂载 `allow-chat-*`。

#### 5.3.2 改动清单

| 文件 / 资源 | 变更类型 | 说明 |
|------------|---------|------|
| `src-tauri/src/workout/mod.rs` | 修改 | `SCHEMA_SQL` 调整为 `pub(crate)`，并追加 `chat_messages` 表、`idx_chat_session`、`idx_chat_recent`（与 workout 表共用同库）。 |
| `src-tauri/src/chat/mod.rs` | 新增 | 新增 chat 模块与 `ChatMessageRecord`；实现 `chat_append_message` / `chat_list_by_session` / `chat_list_recent`；查询统一 `ORDER BY id DESC`，`list_by_session` 支持 cursor 条件 `id < cursor`。 |
| `src-tauri/src/lib.rs` | 修改 | 注册 chat 三个命令到 `invoke_handler`。 |
| `src-tauri/permissions/chat/default.toml` | 新增 | 声明 chat 默认权限及 allow/deny 规则。 |
| `src-tauri/capabilities/default.json` | 修改 | 挂载 `allow-chat-append-message` / `allow-chat-list-by-session` / `allow-chat-list-recent`。 |
| `src/services/chat-history-store.ts` | 新增 | TS 薄封装 `ChatHistoryStore`，提供 `append` / `listBySession` / `listRecent` 三个方法。 |

#### 5.3.3 测试执行与结果

- `cargo test`：通过（11/11）
  - `chat::tests::append_and_recent_return_desc_by_id`：append 3 条后，`listRecent(3)` 返回全部且按 id 降序。
  - `chat::tests::list_by_session_does_not_mix_other_sessions`：不同 `sessionId` 数据隔离，无串扰。
  - `chat::tests::list_by_session_paginates_with_cursor`：`limit=2` 首页返回最新 2 条；传入最后一条 id 作为 cursor 后返回下一批。
  - `chat::tests::content_roundtrip_keeps_unicode_newline_and_quotes`：`content` 含中文、换行、引号时，存取一致。
  - `chat::tests::chat_and_workout_tables_coexist_in_one_db`：chat 与 workout 相关表可共存于同一数据库。
- `pnpm exec tsc --noEmit`：通过（TS 类型检查无错误）。

#### 5.3.4 最终结论与项目负责人验收方法

- 最终结论：
  - B0-11 已按既定架构完成实现与接线；
  - 对话历史写入、按会话分页读取、最近消息读取能力均已落地；
  - Rust 单元测试与 TS 类型检查通过，可判定任务完成。
- 验收方式：
  - 本任务为纯内部逻辑，以 Rust 单元测试通过为主验收标准，不要求项目负责人手动联调。
- 审核链：
  - Codex 自测 → 项目负责人确认 → 架构问题升级 Claude。

---

### 5.4 B0-8

执行范围与对应任务

- 执行批次：Batch 0
- 对应任务：任务8（宠物人格 Prompt 设计）
- 当前状态：已完成（v1.0 定稿）
- 范围：
  - 产出 `docs/01_contracts/docs/01_contracts/persona_prompt_spec.md` v1.0 作为 DeepSeekService 的 Prompt 真值源；
  - 定义基础人格 / 输出通用约束 / 三个 LLM 方法的特定 Prompt（generateMorningReview / generateWorkoutReminder / chat / generateFeedHighlight）；
  - 定义降级文案表 §4；
  - 定义静态文案库规格 §5（实现归 B1-4 落地）；
  - 定义测试用例集 §6（执行归 B1-4 verify 脚本）；
  - 定义 ChatContextBuilder 三阶段实现路径（阶段 1 归 B1-4，阶段 2 归 B2-13）。
- 非范围：
  - 不涉及任何代码；
  - 不直接产出 petCopy.ts / DeepSeekService 等实现文件（这些归 B1-4）。

#### 5.4.1 实施方法

- Claude 起草 v0.1，项目负责人逐节审阅给行级反馈；
- v0.2 闭合主要待确认项（角色边界软化 / 字数松绑 / emoji 政策 / 节流参数下沉 / 高光方法新增 / FTS5 阶段化）；
- v1.0 完成最终对齐（删除估测 PR / 跨文档同步 B2-12 接口位）；
- 文档进入项目知识库并被引用：B1-4 的 prompt 字面与 spec §1+§2+§3 必须严格一致。

#### 5.4.2 改动清单

| 文件 / 资源 | 变更类型 | 说明 |
|------------|---------|------|
| `docs/01_contracts/docs/01_contracts/persona_prompt_spec.md` | 新增 | 人格 Prompt 真值源文档，定稿 v1.0 |
| `docs/03_execution/phaseb_execution_plan.md` §1.2 | 修改 | 新增任务 13（B2-13，FTS5 关键词记忆库） |
| `docs/03_execution/phaseb_execution_plan.md` §2 | 修改 | 新增 §2.13 任务 13 接口边界 |
| `docs/03_execution/phaseb_execution_plan.md` §3 | 修改 | 依赖图 + Batch 2 范围扩入 13 |

#### 5.4.3 测试执行与结果

- 文档型任务，无代码自测；
- 由 B1-4 执行 §6 测试用例对 prompt 效果做真实验证。

#### 5.4.4 最终结论与项目负责人验收方法

- 最终结论：B0-8 已交付 v1.0 文档，作为 B1-4 实施的输入。
- 项目负责人验收方法：
  1. 检查 docs/docs/01_contracts/persona_prompt_spec.md 存在且版本号为 v1.0；
  2. B1-4 的 verify-deepseek.ts 真网验证通过（即可视为 B0-8 prompt 效果验收通过）。
- 审核链：Claude 起草 → 项目负责人逐节审阅 → 架构问题项目负责人裁决。

---

### 5.5 B1-4

执行范围与对应任务

- 执行批次：Batch 1
- 对应任务：任务4（DeepSeek Service 模块）
- 当前状态：已实施（不含真网联调）
- 范围：
  - 实现静态文案库 `petCopy.ts`（5 个导出）；
  - 实现 `DeepSeekService` 4 个方法（generateMorningReview / generateWorkoutReminder / chat / generateFeedHighlight）；
  - 实现 `ChatContextBuilder.getChatContext()` 阶段 1（最近 10 轮，不做 FTS5）；
  - 定义 `deepseek-types.ts` 类型层；
  - 提供一次性验证脚本 `verify-deepseek.ts`。
- 非范围：
  - 不涉及 Rust 代码变更；
  - 不新增 Tauri 命令或权限；
  - 不涉及 UI 代码；
  - 不涉及 StateMachine 调用；
  - 不新增 PetEvent / MajorState。

#### 5.5.1 实施方法

- 前端 `fetch` 直连 `https://api.deepseek.com/chat/completions`（OpenAI 兼容格式），不走 Rust 中转。
- API token 从 SQLite 配置表读取：`invoke('config_get_value', { key: 'deepseekApiKey' })`，复用 B0-3 的 `config_get_value` 命令。
- System Prompt 三段拼装（§1 基础人格 + §2 输出通用约束 + §3.x 方法特定段）在服务构造时组装一次并缓存为实例属性，后续调用复用同一字符串，命中 DeepSeek input cache（按 ¥0.7/M 计费）。
- 所有 prompt 字面与 `docs/01_contracts/persona_prompt_spec.md` v1.0 严格一致，不做措辞优化。
- 温度硬编码：`morning_review` / `chat` = 0.7，`workout_reminder` / `feed_highlight` = 0.5。不暴露给调用方。
- 6 秒硬超时（AbortController + setTimeout）。
- 所有方法返回 `string`；失败走 §4 降级文案；绝不向上抛异常。
- 字数截断：response 超出方法上限时，截断到最后一个句号并加 "……"，不重新调用。
- DEV 模式（`import.meta.env.DEV`）将 prompt + response 以 `console.log` 输出 trace；PROD 仅记失败（`console.error`）。
- ChatContextBuilder 阶段 1：从 `ChatHistoryStore.listRecent(20)` 拉最近 20 条记录（约 10 轮），反转为时间正序，将 `role: 'ichan'` 映射为 `role: 'assistant'`，过滤 system 记录，拼装 `[system, ...history, user]`。
- 验证脚本通过环境变量 `DEEPSEEK_API_KEY` 注入 token，不依赖 Tauri runtime。

#### 5.5.2 改动清单

| 文件 / 资源 | 变更类型 | 说明 |
|------------|---------|------|
| `src/types/deepseek-types.ts` | 新增 | DeepSeek 相关类型定义（ChatMessage、MorningContext、WorkoutSummaryForPrompt、HighlightSummary、ChatMemoryResult 等） |
| `src/config/petCopy.ts` | 新增 | 静态文案库 5 个导出（FEED_COPY / HUNGRY_COPY / PAT_COPY_AWAKE / WAKE_COPY / FAREWELL_COPY），纯常量不引 React |
| `src/services/DeepSeekService.ts` | 新增 | 4 个方法 + System Prompt 缓存 + 6s 超时 + §4 降级路径 + 字数截断 + DEV trace |
| `src/services/ChatContextBuilder.ts` | 新增 | getChatContext() 阶段 1 实现，消费 ChatHistoryStore.listRecent() |
| `scripts/verify-deepseek.ts` | 新增 | 一次性验证脚本（6 步：M1-M3 晨间回顾 + W1 训练提醒 + C1-C5 对话 + 过期 token 降级） |

无修改文件（B0-3 的 `config_get_value` / `config_set_value` 权限已满足 `deepseekApiKey` 读取需求）。

#### 5.5.3 测试执行与结果

- `pnpm exec tsc --noEmit`：通过（TS 类型检查无错误）
- `cargo check`：通过（Rust 编译检查无错误，本卡未改 Rust）
- `scripts/verify-deepseek.ts`：未在本地执行真网联调（当前环境无真实 DeepSeek Token），保留到项目负责人验收阶段。

#### 5.5.4 最终结论与项目负责人验收方法

- 最终结论：
  - B1-4 已按架构决策落地，静态文案库、DeepSeek 服务、ChatContextBuilder 阶段 1 与类型定义已完成；
  - TS 类型检查与 Rust 编译检查通过，可进入集成验收。
- 约束保持：
  - 不涉及 UI；
  - 不直接调用 StateMachine；
  - 不新增 PetEvent / MajorState；
  - Prompt 字面与 spec v1.0 一致。
- 审核链：
  - Claude 自测 → 项目负责人验收 → 架构问题升级审核。
- 项目负责人验收方法：
  1. 在 SQLite 写入真 token：通过现有方式调 `config_set_value('deepseekApiKey', 'sk-...')`。
  2. 执行 `DEEPSEEK_API_KEY=sk-... npx tsx scripts/verify-deepseek.ts`。
  3. 逐项核对 6 步输出与 spec §6 期望（手感主观打分：是否符合 §1 性格画像）。
  4. 用过期 token 复跑第 6 步，确认 chat 走降级文案（"钱包瘪了……"）。
  5. 设置 `DEEPSEEK_DEV_TRACE=1` 跑一次后查看 console 输出，确认 prompt 字面与 spec §1+§2+§3 三段拼接一致。
  6. 验收通过后 token 保留。

#### 5.5.5 - Bug Fix

- 问题现象：
  - 对话调用 DeepSeek 时控制台报错：`[DeepSeek ERROR] scene=chat error=Failed to execute 'fetch' on 'Window': Illegal invocation`。
  - 结果表现为 `chat()` 每次失败并回落到兜底文案。
- 根因分析：
  - `DeepSeekService` 构造函数中将 `fetch` 作为裸函数引用保存（`this.fetchImpl = fetch`）。
  - 在 Tauri WebView 环境中，裸调用会丢失 `Window` 调用上下文，触发 `Illegal invocation`。
- 修复方案：
  - 在 `src/services/DeepSeekService.ts` 中将默认 fetch 实现改为绑定调用上下文：
    - `this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);`
- 影响范围：
  - 仅影响 DeepSeek HTTP 调用层，不改变 B1-4 的接口契约、返回类型与降级策略。
- 验证结果：
  - `pnpm exec tsc --noEmit` 通过。
  - 运行时不再出现 `Illegal invocation`，后续是否走降级仅取决于 API key/网络/HTTP 状态。

---

### 5.6 B1-7

执行范围与对应任务
- 执行批次：Batch 1
- 对应任务：任务 7（首次启动配置向导 FirstRunWizard）
- 当前状态：已完成（本地构建与类型检查通过，真网账号验收留给项目负责人）
- 范围：独立 Tauri `wizard` 窗口、首次启动 gating、4 项配置采集与校验、SQLite config 写入、wizard UI、多入口构建。
- 非范围：不新增 `PetEvent` / `MajorState`，不实现 `setup_partial`，不引入 keyring 或独立配置文件，不改宠物状态机核心契约。

#### 5.6.1 实施方法

- 新增 `src/types/wizard-types.ts`，定义向导类型契约，`SaveCompleteResult.configVersion` 保持 `string`。
- 新增 `src/services/FirstRunWizardService.ts`，实现 `checkSetupStatus()`、`validateAll()`、`saveAndComplete()`、`normalizeNotionDatabaseId()` 与 `maskValue()`。
- Rust 侧在 `src-tauri/src/lib.rs` 增加 SQLite `config` helper、`config_get_value` / `config_set_value`、setup hook、`first_run_complete`、`first_run_close_wizard`、窗口控制命令与 Notion/DeepSeek 轻量 HTTP 校验 adapter。
- 启动时 pet 与 wizard 默认隐藏，由 setup hook 同步读取 `setup_completed` 决定显示哪个窗口。
- 完成时前端先 `saveAndComplete(input)`，再 `invoke('first_run_complete')`，Rust 侧重新确认 `setup_completed === '1'` 后隐藏 wizard 并显示 pet。
- Notion 校验固定 `Notion-Version: 2022-06-28`，DeepSeek 校验使用最小 chat completion，所有 HTTP adapter 使用 6 秒超时。
- `todoDbId` / `researchDbId` 保存前 normalize 为 32 位小写 hex；token/key 默认 masking，eye icon 只切换本地显示。

#### 5.6.2 改动清单

| 文件 / 资源 | 变更类型 | 说明 |
|------------|---------|------|
| `src/types/wizard-types.ts` | 新增 | 向导类型契约与字段验证状态 |
| `src/services/FirstRunWizardService.ts` | 新增 | setup 状态读取、格式校验、真网校验编排、保存完成逻辑、DB ID normalize、token/key masking |
| `src/wizard/index.html` | 新增 | wizard 独立 HTML 入口 |
| `src/wizard/main.tsx` | 新增 | wizard React mount 入口 |
| `src/wizard/WizardApp.tsx` | 新增 | wizard app wrapper |
| `src/wizard/wizard.css` | 新增 | 1024x768 首启向导样式，按钮/输入框/卡片/状态图标均由 CSS/SVG 实现 |
| `src/wizard/components/FirstRunWizard/*` | 新增 | wizard 主组件、步骤条、表单卡片、配置行、提示栏、UI tokens |
| `src-tauri/src/lib.rs` | 修改 | config helper/命令、setup hook、切窗命令、关闭处理、HTTP 校验 adapter |
| `src-tauri/tauri.conf.json` | 修改 | `pet` 与 `wizard` 两窗口默认隐藏，wizard 1024x768、透明、无边框、居中 |
| `src-tauri/capabilities/default.json` | 修改 | capability 覆盖 `pet` 与 `wizard` |
| `vite.config.ts` | 修改 | 多入口构建 `index.html` 与 `src/wizard/index.html` |
| `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` | 修改 | 新增 `reqwest` 与 `rusqlite` 依赖 |

| src/assets/idle/awake/idle_awake_float_01.png | 修改 | feat/fix-b1-7-UI: replace wrong 3KB placeholder with correct sprite from assets/idle/awake (~290KB) |
| src/wizard/components/FirstRunWizard/FirstRunWizard.tsx | 修改 | feat/fix-b1-7-UI: switch window controls from legacy invoke(...) to Tauri v2 getCurrentWindow().minimize() / .toggleMaximize() |
| src-tauri/capabilities/default.json | 修改 | feat/fix-b1-7-UI: add window permissions including core:window:allow-minimize and core:window:allow-toggle-maximize |
| src/wizard/wizard.css | 修改 | feat/fix-b1-7-UI: add translucent background, backdrop-filter, glow layer, and inner shadow for frosted-glass look |
#### 5.6.3 测试执行与结果

- `pnpm exec tsc --noEmit`：通过。
- `cd src-tauri && cargo check`：通过。首次运行需允许 Cargo 访问 crates.io 下载新增依赖。
- `pnpm tauri build --debug`：通过。沙箱内因 esbuild spawn 受限失败一次，升级执行后通过，并生成 debug exe 与安装包。
- `cd src-tauri && cargo test`：通过，当前仓库 0 个 Rust 测试。
- `pnpm tauri dev`：沙箱内因 esbuild spawn EPERM 失败；升级执行后 60 秒超时，符合 dev 命令保持运行的形态，但未获得可见启动日志。编译链路由 `pnpm tauri build --debug` 覆盖。

#### 5.6.4 最终结论与项目负责人验收方法

- 最终结论：
  - B1-7 首次启动配置向导已落地；
  - 启动 gating 由 Rust setup hook 控制；
  - wizard 完成后切窗机制采用 `invoke('first_run_complete')`；
  - 未实现 `setup_partial`；
  - 未改状态机契约、未新增 `PetEvent` / `MajorState`。
- 透明窗口降级：否。
  - 原因：当前构建未发现需要代码降级的问题，但未完成 Windows WebView2 实机视觉验收；
  - 影响：如出现黑边、圆角锯齿或拖拽异常，需按任务卡降级为非透明窗口并保留浅色背景。
- 风险与缓解：
  - 自动化测试覆盖不足：当前仓库无前端测试框架，`cargo test` 为 0 个测试；本次以 `tsc`、`cargo check`、`tauri build --debug` 覆盖编译与构建正确性，真网与 UI 行为需项目负责人按验收步骤手测；
  - `pnpm tauri dev` 验证受限：沙箱内 esbuild spawn 被拒绝，升级执行后因 dev 命令常驻而 60 秒超时；是否作为合并阻断项需项目负责人确认；
  - 轻量 HTTP adapter 是当前仓库状态下的兼容实现，后续若 NotionService / DeepSeekService 补齐公共校验接口，应回收该 adapter 以统一服务边界。
- 需要项目负责人确认 / 升级 Claude 审核：
  1. 当前仓库没有可复用的 `config_get_value` / `config_set_value` 或 SQLite config 实现，本次按 B0-3 契约补齐同名命令与内部 helper；
  2. 当前仓库的 Notion / DeepSeek 服务模块为空或不可复用，本次在 FirstRunWizard 路径中使用 Rust 轻量 HTTP adapter 完成真网校验。
- 项目负责人验收步骤：
  1. 删除本地 `app.sqlite` 或清空 `setup_completed` 后启动应用，确认仅显示 wizard；
  2. 使用错误 Notion token 测试，确认 token 显示无效，`todoDbId` / `researchDbId` 保持未校验态；
  3. 输入真实 Notion token、Todo DB、Research DB、DeepSeek key，点击“测试连接”，确认 4 项变为有效；
  4. 点击“完成，进入 i酱！”，确认 wizard 隐藏、pet 显示；
  5. 重启应用，确认直接进入 pet；
  6. 检查 SQLite `config` 表，确认 6 个 key 存在且 DB ID 已 normalize；
  7. 检查控制台与日志，确认未输出完整 token/key。

#### 5.6.5 feat/fix-b1-7-UI（UI 修复合入）

- 素材修复：src/assets/idle/awake/idle_awake_float_01.png 从错误 3KB 占位图替换为 assets/idle/awake 的正确像素风角色图（约 290KB）。
- 窗口按钮修复：最小化/最大化无效的根因是沿用旧 invoke 命令；现已改为 Tauri v2 Window API：getCurrentWindow().minimize() 与 getCurrentWindow().toggleMaximize()，并补齐 capability 权限。
- 毛玻璃视觉修复：src/wizard/wizard.css 增加半透明层、backdrop-filter、动态光晕层与 inset box-shadow，使向导窗口具备稳定的磨砂玻璃质感。
- 影响边界：本次仅调整 UI 素材、窗口交互与样式层，不改变 B1-7 的配置契约和 setup gating 主流程。

---

### 5.7 B1-10

执行范围与对应任务

- 执行批次：Batch 1
- 对应任务：任务10（对话 UI 系统 interactive_box）
- 当前状态：已实施（含实现后多轮问题修复）
- 范围：
  - 落地 `interactive_box` 对话 UI（560×360、毛玻璃、暖橙主色、流式气泡、输入区、发送按钮）；
  - 组件化实现 `TalkingInteraction` / `MessageBubble` / `InputBar` / `SendButton`；
  - 接线 `ChatHistoryStore` 与 `DeepSeekService.chat`，实现发送、失败兜底、历史回看、活跃消息淡出；
  - 接入 `PetCanvas mode='dialog'` 复用与 DevPanel mock 验收入口；
  - 完成双击打开、Esc/X 关闭与开关过渡动画调优。
- 非范围：
  - 不新增 `MajorState`；
  - 不修改状态机 public API；
  - 不在本任务正式落地 `dialog.close` 状态机闭环（归 B2-9）。

#### 5.7.1 实施方法

- 以 `Talking_UI_Draft_v3.png` 为视觉真值源，先定义 `dialog-tokens.ts` 与 `dialog-types.ts`，再拆分 Dialog 组件组实现。
- 在 `TalkingInteraction.tsx` 完成核心交互链路：
  - Enter 发送、空输入禁用发送；
  - 先 append 用户气泡，再写入 `ChatHistoryStore`，再调用 `DeepSeekService.chat`；
  - 响应成功 append i酱气泡并落库；失败 append failed 气泡，不中断 UI。
- 历史回看采用 wheel up 进入 `history_review`，优先 `listBySession`，不足阈值 fallback `listRecent`，展示前转正序。
- 打开对话时生成 `activeSessionId`（`dialog-YYYY-MM-DD-6位后缀`），并执行窗口几何联动与 350ms 苹果风过渡。
- `PetCanvas` 通过 `mode='dialog'` 复用，dialog 期间抑制 roaming 位移渲染干扰，保持对话视觉稳定。

#### 5.7.2 问题清单与解决方案

以下按“实现开始 → 用户反馈 → 修复”的时间顺序记录：

1. interactive_box 尺寸与构图偏离设计稿
   - 现象：首版落地后，容器比例、角色占位、输入区空间与 `Talking_UI_Draft_v3` 差异明显。
   - 解决：
     - 收敛 `interactive-box` 固定尺寸为 560×360，并统一布局 token；
     - dialog 场景下将 `PetCanvas` 显示高度收敛到 136，避免角色占位过高挤压消息区与输入区。

2. 双击打开 talking 闪烁后立即回收（闪退）
   - 现象：双击后出现一帧半透明背景，随即回收；DevPanel 打开不复现同等闪退。
   - 根因：`user.doubleClick` 与延迟 `user.pat` 竞争，叠加“离开 talking 即自动 close”逻辑，导致开启后瞬时被打断。
   - 解决：
     - `handlePatClick` 仅处理 `event.detail === 1`；
     - pat 延迟回调增加 dialog/talking 二次检查，屏蔽残留 pat；
     - 扩大 `ignorePatUntil` 防抖窗口；
     - 移除“离开 talking 自动 close”分支，保持 B1-10 的 UI 驱动关闭路径（Esc/X/onClose）。

3. DevPanel 打开后仍处于 roaming 动画
   - 现象：通过 DevPanel 打开对话后，小人仍随机游荡，未稳定在 talking/idle.awake still 视觉。
   - 解决：
     - `openDialogByStateOrFallback` 优先走 `user.doubleClick`，失败后二次探测再 fallback；
     - 增加 `stabilizeDialogMovementVisual`，在 dialog 活动期检测到 `idle.awake + roaming` 时派发 `timer.roaming.tick` 拉回 still；
     - 在状态订阅回调中加入 dialog 期间 roaming 防抖处理。

4. talking 结束后的动画衔接不流畅
   - 现象：关闭对话后，窗口几何恢复与角色动画切换同帧，观感有抖动/顿挫。
   - 解决：
     - 新增 `DIALOG_MOVEMENT_RESUME_DELAY_MS`，延迟恢复 movement；
     - close 结束后下一帧再 unmount dialog，减少同帧抖动；
     - 关闭请求处于 talking 时派发既有事件触发平滑退出链路（不改状态机 API）。

5. 视觉样式仍与设计稿不一致
   - 现象：毛玻璃层次、输入区贴底间距、气泡细节、会话 tag 暴露等与 `Talking_UI_Draft_v3` 有偏差。
   - 解决：
     - 重写 `TalkingInteraction.css`：背景渐变+毛玻璃、输入区 `bottom: 20px`、气泡尾巴与层次、兼容 fallback；
     - 隐藏 session tag；
     - emoji/send 图标改为 SVG，统一渲染效果并提升抗编码问题能力。

6. 文案与符号乱码导致显示异常
   - 现象：标题、placeholder、失败提示、loading 文案、mock 文案、speaker label、按钮符号出现乱码。
   - 解决：统一清理 `TalkingInteraction.tsx`、`InputBar.tsx`、`MessageBubble.tsx`、`SendButton.tsx` 文案与符号，恢复稳定中文显示。

#### 5.7.3 改动清单

| 文件 / 资源 | 变更类型 | 说明 |
|------------|---------|------|
| `src/components/Dialog/dialog-tokens.ts` | 新增 | 对话 UI 尺寸、动画、布局 token 定义 |
| `src/components/Dialog/dialog-types.ts` | 新增 | Dialog 相关类型定义 |
| `src/components/Dialog/Dialog.tsx` | 新增 | Dialog 导出层（组件组聚合） |
| `src/components/Dialog/TalkingInteraction.tsx` | 新增 | 对话主交互组件，含发送/回看/关闭/会话逻辑 |
| `src/components/Dialog/TalkingInteraction.css` | 新增 | 对话 UI 样式还原与修复（毛玻璃、气泡、输入区、动画） |
| `src/components/Dialog/MessageBubble.tsx` | 新增 | 消息气泡组件 |
| `src/components/Dialog/InputBar.tsx` | 新增 | 输入区组件（textarea + emoji + send） |
| `src/components/Dialog/SendButton.tsx` | 新增 | 发送按钮组件（SVG 图标） |
| `src/App.tsx` | 修改 | 对话开关动画、双击链路防抖、movement 稳定化、DevPanel 入口接线 |
| `src/App.css` | 修改 | dialog 模式下容器/层级样式适配 |
| `src/components/Pet/PetCanvas.tsx` | 修改 | 新增 `mode='dialog'` 布局定位与复用控制 |
| `src/components/DevPanel/DevPanel.tsx` | 修改 | 新增 Dialog mock 验收按钮组 |

#### 5.7.4 测试执行与结果

- `pnpm exec tsc --noEmit`：通过
- `cargo check`：通过
- 说明：
  - 本卡关键验证以编译与类型检查为硬门槛；
  - 双击/DevPanel/视觉还原等交互项已在实现过程中按用户反馈多轮修复，最终以项目负责人手测终验为准。

#### 5.7.5 最终结论与项目负责人验收方法

- 最终结论：
  - B1-10 已完成 interactive_box 主体实现与问题修复链闭合；
  - 当前分支已覆盖“尺寸偏差、双击闪退、roaming 干扰、结束不流畅、乱码、视觉偏差”六类核心问题；
  - 边界约束保持：未新增 `MajorState`，未改状态机 public API，未提前实现 B2-9 的 `dialog.close` 正式闭环。
- 项目负责人验收方法：
  1. 双击宠物打开 dialog，确认不再出现“一帧半透明后回收”；
  2. 通过 DevPanel 打开 dialog，确认宠物不再持续 roaming 干扰对话；
  3. 对照 `ichanDesign/Talking_UI_Draft_v3.png` 核对容器尺寸、输入区位置、气泡样式、毛玻璃层次；
  4. 发送空文本，确认发送按钮禁用；输入后按 Enter 可发送；
  5. 断网或制造服务失败，确认显示失败气泡且 UI 不崩溃；
  6. 使用滚轮上滑进入历史回看，确认读取 `listBySession` / fallback `listRecent`；
  7. Esc 与 X 关闭均走同一路径，关闭后动画衔接平滑。
 - 备注：当前阶段可以算基本完成，剩余的是待调整参数，如退出/进入动画的平滑性；对于动画平滑性，我的看法是，保持前一个状态的动画位置不变，在此基础上进行窗口扩展。

---

### 5.8 B1-10A

执行范围与对应任务

- 执行批次：Batch 1（B1-10 子任务）
- 对应任务：任务10 子任务（interactive_box 中心锚点式进入 / 退出动画重构）
- 当前状态：已实施（tsc 与 debug build 通过，手动验收通过）
- 范围：
  - 将 interactive_box 打开/关闭过渡重构为以 i酱锚点盒中心为原点的展开/收束动画；
  - 实现 `DialogTransitionPhase` 完整状态机（measuring → compact → opening → open → closing.messages → closing.shell → closing.window）；
  - 实现 measuring 帧方案：两帧 rAF 完成 reveal-item 测量后再执行 opening；
  - 实现 clip-path 圆形展开（主方案）与 scale+opacity（fallback）；
  - 新增几何常量、anchor 工具函数与 runtime assert；
  - 接线 `ignore_cursor_events` 快照/恢复与窗口 snap（setSize + setPosition）；
  - 关闭期间阻断二次打开请求。
- 非范围：
  - 不新增 `MajorState`；
  - 不修改 `StateMachine` public API；
  - 不提前落地 B2-9 的 `dialog.close` 状态机闭环；
  - 不新增 talking exit spritesheet；
  - 不对 `PetCanvas` 或 i酱本体施加任何 CSS `scale` transform；
  - 不修改 `src/state/**`、`src/animation/**`、`src-tauri/**`、`src/services/**`。

#### 5.8.1 实施方法

**几何设计**

锚点对齐公式：compact anchor center = (190, 200)，dialog anchor center = (129, 196)，偏移量固定为 (+61, +4)：
- 打开：`newX = cx + 61`，`newY = cy + 4`
- 关闭：`compactX = dx - 61`，`compactY = dy - 4`

宠物显示采用 α 策略：compact 期间 `PetCanvas` 显示 291×180，opening 启动瞬间 snap 到 150×136，closing.window 后 snap 回 291×180；全程无 CSS scale，避免压扁像素艺术（compact 291×180 比例 1.617，dialog 150×136 比例 1.103，二者不相似形）。

**时序分层**

- `openingMs = 320ms`：clip-path 圆形展开 + reveal-item fly-in
- `closingMessagesMs = 180ms`：消息气泡 opacity 淡出
- `closingShellMs = 220ms`：背景/输入区/reveal-items 收束回 anchor
- `windowSnapFrameMs = 16ms`：window snap 回 compact，恢复 ignore_cursor_events 快照

**measuring 帧方案**

首次挂载时：T0 phase=measuring（dialog-shell visibility:hidden）→ rAF #1 读取所有 `[data-reveal-item]` 的 `getBoundingClientRect()`，计算 `--reveal-from-x/y` 并注入 inline style → rAF #2 移除 `data-reveal-measuring`，phase 转 compact → openDialog() 后进入 opening。消息列表变化时，对变更项临时设 `data-reveal-measuring="true"` 后单独重测，已稳定项不受影响。

**CSS 主方案**

`.dialog-shell` 使用 `clip-path: circle(radius at anchorX anchorY)` 展开/收束；`.reveal-item` 使用 `translate(--reveal-from-x, --reveal-from-y) scale(0.72)` → `translate(0,0) scale(1)` 飞入动画。closing.shell 阶段单独覆盖 transition 时长为 `--dialog-closing-shell-ms`（220ms），使 CSS 动画与相位计时器对齐。fallback 降级为 scale+opacity；无 backdrop-filter 时降级为纯色背景。

**callback ref 模式**

所有外部回调（`onAfterOpen`、`onAfterClose`、`onClosingWindowPhase`、`onPhaseChange`）存入 `useRef` 并在每次 render 同步更新，不参与任何 `useCallback` / `useEffect` 依赖数组，使内部函数引用全局稳定。

#### 5.8.2 问题清单与解决方案

1. **TypeScript 类型错误（RefObject）**
   - 现象：React 19 将 `useRef<T>(null)` 返回类型从 `RefObject<T>` 改为 `RefObject<T | null>`，导致接口声明 `RefObject<HTMLDivElement>` 与实际类型不兼容，tsc 报错两处。
   - 解决：将 `UseDialogAnchorTransitionOutput` 中 `rootRef` / `anchorRef` 的类型改为 `RefObject<HTMLDivElement | null>`。

2. **closing.shell 动画被截断**
   - 现象：closing.shell 计时器 220ms，但 reveal-item 和 dialog-shell 的 CSS `transition` 均使用 `--dialog-transition-ms`（320ms），动画进行到 68% 时即被 closing.window 截断。
   - 解决：为 `closing.shell` 拆出独立 CSS 规则，单独覆盖 `transition` 时长为 `--dialog-closing-shell-ms`（220ms），使动画在相位结束前完整收束。

3. **Dialog 永远卡在 measuring、无法打开（根本原因）**
   - 现象：双击小人后窗口扩展，但 dialog-shell 始终不可见（`visibility: hidden`）；DevPanel "Open Dialog Mock" 只播放 Talk 动画而不显示对话 UI；Append / Long text / History Review 按钮无反应；关闭后再次双击同样卡住。
   - 根因：`TalkingInteraction.tsx` 以内联箭头函数向 hook 传入 `onAfterOpen`、`onAfterClose`、`onClosingWindowPhase`、`onPhaseChange`，每次 render 产生新引用。这触发以下依赖链崩溃：
     ```
     onPhaseChange（每次 render 新引用）
       → setPhase useCallback 重建         （deps: [onPhaseChange]）
       → runMeasurePass useCallback 重建   （deps: [..., onAfterOpen, setPhase]）
       → 主 useEffect 重新执行             （deps: [..., runMeasurePass, setPhase]）
       → cancelMeasureFrames()            ← 杀掉所有挂起的 rAF
       → setPhase("measuring") + runMeasurePass(true)  ← 永远重置，永远不完成
     ```
     具体触发点：rAF #1 中 `applyRevealOffsets` 调用 `setRevealRadius` → React re-render → `runMeasurePass` 引用变更 → 主 effect 重新执行 → rAF #2 被取消 → measuring 永远不退出。
   - 解决：**callback ref 模式**。将 4 个外部回调全部改为 `useRef` 存储，在 render body 中同步更新，内部所有 `useCallback` 通过 `ref.current` 调用，不再将这些回调列入依赖数组。修复后各内部函数仅创建一次，全局稳定；主 `useEffect` 仅在 `open` 或 `isDialogRequestedOpen` 实际变化时执行。

#### 5.8.3 改动清单

| 文件 / 资源 | 变更类型 | 说明 |
|------------|---------|------|
| `src/components/Dialog/dialog-transition.ts` | 新增 | 几何常量（COMPACT_WINDOW / COMPACT_PET_DISPLAY / COMPACT_PET_ANCHOR_IN_WINDOW / DIALOG_WINDOW / DIALOG_PET_DISPLAY / DIALOG_PET_ANCHOR_IN_WINDOW）、AnchorBox / Point 接口、getBoxCenter / getDialogWindowPositionFromCompact / getCompactWindowPositionFromDialog 工具函数、assertCompactDialogGeometry / isCompactDialogGeometryValid runtime assert |
| `src/components/Dialog/dialog-types.ts` | 修改 | 新增 `DialogTransitionPhase` 类型（measuring / compact / opening / open / closing.messages / closing.shell / closing.window）、`DialogCloseReason`、`TalkingInteractionProps.onClosingWindowPhase` 回调 |
| `src/components/Dialog/dialog-tokens.ts` | 修改 | 新增 `DIALOG_TRANSITION`（openingMs:320 / closingMessagesMs:180 / closingShellMs:220 / windowSnapFrameMs:16 / easing）；新增 `DIALOG_PET_LAYOUT`、`DIALOG_STAGE_LAYOUT`、`ACTIVE_MESSAGE_FADE`、`HISTORY_REVIEW` token |
| `src/components/Dialog/useDialogAnchorTransition.ts` | 新增 | phase 状态机、measuring 两帧 rAF 编排、reveal-item 中心测量与 CSS variable 注入、reveal radius 动态计算、closing 三段计时器、window snap 与 ignore_cursor_events 回调挂载点、closing 期间 open 请求吸收；全部外部回调改为 callback ref 模式，确保内部函数引用稳定 |
| `src/components/Dialog/TalkingInteraction.tsx` | 修改 | 接入 `useDialogAnchorTransition`；root div 设 `data-dialog-phase`；dialog-shell / header / history-hint 标记 `data-reveal-item`；增加 measureSignal 驱动重测；移除旧动画逻辑 |
| `src/components/Dialog/TalkingInteraction.css` | 修改 | 实现 clip-path 圆形展开主方案；实现 reveal-item translate+scale fly-in；新增 closing.shell 独立 transition 覆盖（220ms）；实现 measuring 帧 visibility:hidden；实现 @supports not(clip-path) fallback 与 @supports not(backdrop-filter) fallback |
| `src/components/Dialog/InputBar.tsx` | 修改 | 输入区容器标记 `data-reveal-item="true" data-reveal-key="input-bar"`、添加 `reveal-item` 类 |
| `src/components/Dialog/MessageBubble.tsx` | 修改 | 气泡标记 `data-reveal-item="true" data-reveal-key="message-{id}"`、添加 `reveal-item` 类 |
| `src/components/Dialog/SendButton.tsx` | 修改 | 发送按钮标记 `data-reveal-item="true" data-reveal-key="send-button"` |
| `src/App.tsx` | 修改 | 新增 `DialogTransitionSession` 快照（openDialog 调用瞬间记录 `previousCompactIgnoreCursorEvents`）；实现 `runDialogOpenTransition`（并行 setSize + setPosition + setIgnoreCursorEvents，失败降级串行）；实现 `runDialogCloseWindowSnap`；实现 `requestDialogOpen` 关闭期间吸收守卫；接线 `onClosingWindowPhase` 与 `handleDialogTransitionPhaseChange` |
| `src/App.css` | 修改 | `pet-hitbox--dialog` 适配 560×360；`pet-canvas-mode-dialog` / `pet-canvas-mode-default` 尺寸与定位无 CSS scale |

#### 5.8.4 测试执行与结果

- `pnpm exec tsc --noEmit`：**通过**（无错误输出）
- `pnpm tauri build --debug`：**通过**，产物：`desktop-pet_0.1.0_x64_en-US.msi` + `nsis exe`
- 手动验收：
  - 双击小人 → 窗口以 anchor 中心展开，对话 UI 正常显示，无闪退；
  - DevPanel "Open Dialog Mock" → 对话 UI 展开，四个消息注入按钮均生效；
  - X / Esc 关闭 → 消息淡出 → shell 收束 → 窗口回 compact，动画三段衔接正常；
  - 关闭后再次双击 → 正常重新打开，无卡死；
  - 关闭期间（416ms 内）连续双击 → 请求被吸收，不重新 opening，不窗口闪退。

#### 5.8.5 最终结论与项目负责人验收方法

- 最终结论：
  - B1-10A 已完成 anchor 过渡重构与 callback 稳定性修复；
  - dialog-shell 从 i酱锚点中心圆形展开/收束（主方案），在不支持 clip-path 的环境降级为 scale+opacity；
  - reveal-item（header、气泡、输入区）从 anchor 方向 fly-in；
  - measuring 帧保证测量时 transform:none，不硬编码 final 坐标；
  - 关闭总时长 416ms（180 + 220 + 16），closing.shell CSS 动画与计时器对齐；
  - 边界约束全部保持：未新增 MajorState，未改状态机 public API，未提前落地 B2-9 dialog.close 闭环，未对 PetCanvas 施加 CSS scale。
- 项目负责人验收方法：
  1. 双击宠物，确认 dialog-shell 从 i酱位置圆形展开，header / 气泡 / 输入区从 anchor 方向飞入；
  2. 通过 DevPanel "Open Dialog Mock"，点击"Append Ichan Message / Append User Message / Long Text Demo / History Review Demo"，确认四个按钮均有反应；
  3. 点击 X 或按 Esc，确认消息先淡出（180ms）→ shell 收束（220ms）→ 窗口回 compact（16ms），三段动画依次完成，总时长约 416ms；
  4. 关闭后立即（<416ms）再次双击，确认不会重新 opening / 不闪退 / 不 phase 卡死；
  5. 关闭完成后再次双击，确认正常重新打开；
  6. 核对打开时窗口位置偏移为 (+61, +4)，关闭时回收偏移为 (-61, -4)（可用 DevPanel 观察窗口坐标变化）；
   7. 确认 PetCanvas 在 dialog 模式下无 CSS scale transform，仅尺寸从 291×180 snap 至 150×136。

---

### 5.9 B1-10A 完成摘要（2026-04-27 文档治理）

- **状态**：B1-10A 已完成
- **长期动效规则已抽取**：anchor-box 模型、phase 枚举、时序规格、CSS 方案、PetCanvas 复用规则、activeSessionId 格式等已抽取为长期真值源 → `docs/02_ui_schema/dialog_transition_schema.md`
- **任务卡归档**：B1-10A 实施报告保留在本文件 §5.8，任务卡归档到 `docs/04_task_cards/done/`
- **不新增 public API**：未新增 MajorState，未改 StateMachine public API
- **不改变既有契约**：`interface_v1_2.md`（现路径 `docs/01_contracts/interface_v1_2.md`）无变更，除非另有明确批准
- **docs 目录已结构化归拢**：详见 `docs/docs_index.md` v2.0

---

### 5.10 B1-12

执行范围与对应任务

- 执行批次：Batch 1
- 对应任务：任务12（hungry 自动判定逻辑）
- 当前状态：已完成（2026-04-28）

#### 5.10.1 实施方法

- 状态机单入口收口：移除 `setHungry(...)` 公共入口，改为 `dispatch({ type: 'hungry.set', value })` 驱动；内部改为 `private applyHungryFlag()`。
- 配置回流：`petBehaviorConfig` 新增 `hungry.thresholdDays=3` 与 `hungry.evaluateOnStartup=true`。
- 持久化通道：新增 `PetContextService`，使用 SQLite `config` 表键 `petcontext.lastCsvImportDate` 读写 `lastCsvImportDate`。
- 判定服务：新增纯函数 `decideHungry(input)`，处理空值、非法日期、未来日期与阈值边界。
- 启动接线：`App.handlePlayerReady` 中保持 `machine.start()` 同步执行，在其后异步执行 hungry 判定并派发 `hungry.set`。
- Dev 观测：DevPanel 新增 `Hungry Decision` 卡片，展示 `lastCsvImportDate`、`thresholdDays`、`isHungry`、`daysSinceFeed`。

#### 5.10.2 改动清单

- `src/components/Pet/types.ts`：补充 `PetEvent` 分支 `{ type: 'hungry.set'; value: boolean }`
- `src/state/StateMachine.ts`：新增 `case 'hungry.set'`；`setHungry` 改私有 `applyHungryFlag`
- `src/App.tsx`：启动后异步 hungry 判定链路 + DevPanel hungry props 透传
- `src/components/DevPanel/DevPanel.tsx`：新增 hungry 只读观测字段与展示卡片
- `src/services/PetContextService.ts`：新增持久化服务与迁移占位 `migrateFromConfigTable`
- `src/services/HungryDecisionService.ts`：新增判定纯函数
- `src/services/__tests__/HungryDecisionService.test.ts`：新增 7 组单测
- `src/config/petBehaviorConfig.ts`：新增 `hungry` 参数组
- `docs/01_contracts/behavior_config.md`：升级 v1.3，新增 §2.7 与 §3.9

#### 5.10.3 测试执行与结果

- `pnpm exec tsc --noEmit`：通过
- `pnpm test`：通过（`HungryDecisionService` 7/7）

#### 5.10.4 结论与验收建议

- 结论：B1-12 已按接口与架构约束落地；hungry 自动判定链路已可在启动后异步生效。
- 联合验收提示：B1-2 完成后按“CSV 导入成功 -> `setLastCsvImportDate(today)` -> `dispatch({ type: 'hungry.set', value: false })`”做联调验收。

---

### 5.11 B1-2

执行范围与对应任务

- 执行批次：Batch 1
- 对应任务：任务2（CSV 拖拽投喂交互）
- 当前状态：已完成（2026-04-28）

#### 5.11.1 实施方法

- 交互入口替换：移除 `App.tsx` 的 React DOM `handleDragOver/handleDrop`，改为 Tauri 窗口级 `onDragDropEvent`。
- 严格单路径策略：仅处理 `payload.type === 'drop'` 且只读取 `paths[0]`，不扫描后续文件。
- 反馈优先：扩展名通过后立即 `dispatch({ type: 'user.feed', csv: new File([], filename) })` 触发 eating 动画，再异步执行 `importCSV`。
- 成功事务链：导入成功后执行 `PetContextService.setLastCsvImportDate(today)`，随后 `dispatch({ type: 'hungry.set', value: false })`。
- 失败映射收口：按错误字符串分支到 `empty/io/parse` 文案，toast 统一走 `showStatus`，时长固定 `CSV_FEED_TOAST_MS = 2400`。

#### 5.11.2 改动清单

- `src/App.tsx`：删除 DOM 拖拽 handler；顶层接入 `useDragDropFeed`，并增加 dialog gating（`!dialogModeActiveRef.current`）。
- `src/hooks/useDragDropFeed.ts`：新增窗口级拖拽监听、导入链路与 toast 路由。
- `src/config/petCopy.ts`：新增 `FEED_COPY.notCsv`、`FEED_COPY.ioError`。
- `docs/param_audit.md`：补充 `CSV_FEED_TOAST_MS` 参数来源与取值。

#### 5.11.3 测试执行与结果

- `pnpm exec tsc --noEmit`：通过
- `pnpm test`：通过（在提权环境运行，解决沙箱 `spawn EPERM`）
- `pnpm tauri build --debug`：通过（在提权环境运行，解决沙箱 `spawn EPERM`）
- `pnpm tauri dev`：可启动，但当前自动化终端无法完成窗口拖拽手测；需在本地 GUI 会话补跑手动验收清单

#### 5.11.4 结论与验收建议

- 结论：B1-2 集成链路已落地，满足“先 eating、后导入、成功解 hungry、失败仅 toast 不回滚动画”的约束。
- 验收建议：在本地桌面会话按任务卡 §7.2 执行多场景拖拽（含 dialog 开关、多文件顺序、空/坏 CSV）做最终行为确认。

---

### 5.12 B2-13

执行范围与对应任务

- 执行批次：Batch 2
- 对应任务：任务13（chat 历史 FTS5 关键词记忆库）
- 当前状态：已完成（2026-04-29）

#### 5.12.1 实施摘要

- Rust 侧新增 `src-tauri/src/chat/memory.rs`：FTS5 索引 DDL、jieba 分词、`chat_memory_build_index`、`chat_memory_query`、参数化 MATCH 查询与 90 天时间窗。
- `chat_append_message` 升级为单事务写入：`chat_messages` 与 `chat_memory_index` 同事务提交；`system` 角色不入索引。
- Tauri 命令注册新增 `chat_memory_build_index` / `chat_memory_query`。
- TS 侧新增 `src/services/ChatMemoryStore.ts`，并升级 `ChatContextBuilder` 为阶段 2：`[system, 可选recalled-system, ...recentWindow, user]`。
- 对话链路接线：`TalkingInteraction` 改为调用 `chatContextBuilder.getChatContext(trimmed, activeSessionId)`。

#### 5.12.2 关键改动文件

- `src-tauri/src/chat/memory.rs`
- `src-tauri/src/chat/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src/services/ChatMemoryStore.ts`
- `src/services/ChatContextBuilder.ts`
- `src/components/Dialog/TalkingInteraction.tsx`
- `src/services/__tests__/ChatContextBuilder.test.ts`
- `src/services/__tests__/ChatMemoryStore.test.ts`

#### 5.12.3 测试与验收

- `cargo check`：通过
- `cargo test`：通过（24 passed）
- `pnpm exec tsc --noEmit`：通过
- `pnpm test`：通过（3 files / 14 tests）

#### 5.12.4 结论

- B2-13 已完成，FTS5 关键词召回与 recentWindow 组合上下文可用于跨会话记忆增强，且包含 FTS5 不可用时的降级路径（仅 recentWindow）。

---

### 5.13 B2-9

执行范围与对应任务

- 执行批次：Batch 2
- 对应任务：任务9（talking 正常退出机制闭合）
- 当前状态：已完成（2026-04-29）

#### 5.13.1 实施摘要

- 正式事件契约：`dialog.open` / `dialog.close` 纳入 `PetEvent`。
- StateMachine：新增 `handleDialogOpen/handleDialogClose`，`user.doubleClick` 降级为 notification-only。
- Router：新增 `dialogRouter`，双击与 `Ctrl+Alt+T` 统一走 `alive + idle + !dialogOpen` gate。
- Close Bridge：新增 `dialogStateBridge`，仅处理 `talking -> non-talking` 且 UI 仍打开的单向关闭兜底。
- DevPanel：新增 B2-9 Force PetEvent 按钮组（4个）验证开关路径。

#### 5.13.2 改动清单

- `src/components/Pet/types.ts`
- `src/state/StateMachine.ts`
- `src/integration/dialogRouter.ts`
- `src/integration/dialogStateBridge.ts`
- `src/App.tsx`
- `src/components/DevPanel/DevPanel.tsx`
- `src/state/StateMachine.dialog.test.ts`
- `src/integration/dialogRouter.test.ts`
- `src/integration/dialogStateBridge.test.ts`

#### 5.13.3 测试执行与结果

- `pnpm exec tsc --noEmit`：通过
- `pnpm test`：通过（提权环境，规避沙箱 `spawn EPERM`）

#### 5.13.4 - Bug Fix

问题现象汇总（验收阶段）

- 现象 1：双击宠物后应用闪退，或进入 `talking` 后立即被打回 `idle`，对话 UI 未稳定展示。
- 现象 2：DevPanel `Force talking` 直接切动画，不经过对话 UI；`Force dialog.open` 行为与预期理解不一致。
- 现象 3：对话 UI 只渲染局部（窗口被裁切），输入区/面板显示不完整。
- 现象 4：`Force dialog.open from drowsy` / `from napping` 时，未出现对话 UI；Esc 在部分场景无效，只能 Force close 退出。

排查方式与证据链

- 前端增加结构化调试日志，覆盖 open/close 全链路：
  - `ui.doubleClick.begin`、`dialog.open.request`、`dialog.open.transition.*`
  - `dialog.bridge.triggered`、`dialog.close.request.accepted`
  - `machine.start.done`、`app.mount` / `app.unmount`
- 将日志持久化到 `localStorage`，并提供回放与清理入口，确保闪退后可复盘。
- 关键日志结论：
  - `dialog.open` 请求已被接受并执行，但随后极短时间触发 `dialog.bridge.triggered -> dialog.close.request.accepted`，并伴随 `machine.start.done` 重入，说明存在生命周期重置导致的“打开后立刻关闭”。
  - DevPanel Force open 路径未设置 pending UI open 标记时，不会自动打开 UI；该行为与 B2-9 任务卡语义一致（非缺陷）。
  - UI 裁切与窗口几何过渡开关/窗口尺寸切换链路相关，属于实现问题，不是状态机事件语义问题。

根因定位

- 根因 A（主因，闪退/瞬关）：`PetCanvas` 生命周期不稳定，player 在渲染过程中被重复创建，`onReady` 多次触发，`handlePlayerReady` 内重复 `machine.start()`，造成状态机重启与 bridge close 连锁触发。
- 根因 B（显示不完整）：临时关闭 geometry transition 的兜底策略导致窗口尺寸与 UI 容器不一致，出现“仅显示局部”。
- 根因 C（预期偏差）：DevPanel Force 系列按钮是“事件层隔离验证”，按设计不承担 UI 自动打开职责；文档旧版本存在口径混杂，导致验收预期偏移。
- 根因 D（Esc 失效的场景性问题）：当 UI 未进入稳定对话态或焦点不在对话层时，局部按键监听无法覆盖。

修复方案与落地

- 修复 1：稳定 `PetCanvas` player 生命周期，避免因 `displayHeightPx/onReady` 变化重建 player。
  - 在 `PetCanvas` 中使用 `onReadyRef` 持有最新回调，减少 effect 依赖导致的重建。
- 修复 2：为 `handlePlayerReady` 增加启动幂等保护。
  - `machineReadyRef.current` 已为 true 时仅 `machine.init(player)`，跳过二次 `machine.start()`。
- 修复 3：恢复并校正 dialog 窗口几何过渡链路，移除“geometry disabled”临时绕行造成的裁切副作用。
- 修复 4：调整 DevPanel 的 drowsy/napping force 打开路径实现，先构造状态路径再走物理事件路由，保证与主链路一致的 pending 消费行为。
- 修复 5：增加 App 级 Esc fallback（capture 阶段），在 dialog active 时强制走 `requestDialogClose`，补齐焦点异常场景。
- 修复 6：补充调试与防护日志点，覆盖 open/close 请求、bridge 触发、状态订阅与过渡完成事件，便于后续复盘。

最终结论与经验沉淀

- B2-9 当前问题以“实施缺陷”为主，不是架构主线错误。
- DevPanel `Force dialog.open` 不自动开 UI 属于设计约束；真实开链路应以“双击/快捷键物理输入 -> router -> dialog.open -> pending consume -> UI open”为准。
- 文档治理结论：
  - 以 `B2-9_task_card_v1.2.md` + `B2-9_implementation_details_v0.2.md` + `B2-9_architecture_v0.3_patch.md` 作为有效口径；
  - `B2-9_architecture_v0.2.md` 与 `B2-9_implementation_details_v0.1.md` 仅保留历史参考，避免继续用于验收判定。
