# 🐾 桌面助手项目手册 (ichan_project_doc)

> **版本**:
  > v0.3.1 - 2026-04-16;
  > v0.3.2 - 2026-04-18;
  > v0.4.0 - 2026-04-19;
  > v0.4.5 - 2026-04-20;
  > v0.4.6 - 2026-04-21;
  > v0.4.7 - 2026-04-23;
  > v0.4.8 - 2026-04-23;
  > v0.4.9 - 2026-04-25;
  > v0.5.0 - 2026-04-27
  > v0.5.1 - 2026-04-27（审计+落地对齐修订）
> **维护者**: Claude/GPT + 项目负责人MaxeonY
> **用途**: 所有参与开发的 AI 共享此文档作为唯一上下文来源
> 动画资源的实际帧名、帧序、循环方式，以 `ani_resources.md` 为唯一事实来源；
> 本文档中的动画章节主要负责定义状态语义、资源目录映射和实现约束。

---

## 1.项目概述

### 1.1 是什么

一个 Windows 桌面宠物应用。它是一个可爱的小生物，住在用户的桌面上，具备两个核心价值：

1. **情感陪伴** — 在桌面上闲逛、睡觉、可以被摸头和喂食
2. **每日节奏管理** — 每天开机时主动完成"晨间仪式"：睡眠询问 → 昨日回顾 → 今日计划 → 健身提醒

### 1.2 不是什么

- 不是论文阅读工具（用户用 Zotero）
- 不是代码助手（用户用 VS Code + Copilot）
- 不是深度对话 AI（用户有 Claude / GPT 客户端）
- 不是 Notion 的替代品（宠物只是 Notion 的"嘴巴"——读数据、说给你听、帮你写回去）

### 1.3 用户画像

研究生，科研 + 健身 + 生活管理。日常工具链：Notion（知识库）、Zotero（文献）、VS Code（代码）、Chrome（浏览器）、Hevy（健身记录）。对成本敏感。

### 1.4 角色设定：i酱 (ichan)

**名字由来**: i 是虚数单位，在实数轴上"不存在"，但在复平面上有自己的位置。代表"另一个自己"——一个看不见但真实陪伴着你的存在。

**美术风格**: 像素风（Pixel Art），参考 Claude Code 的橘黄色像素小人风格。角色尺寸约 32×32 或 48×48 像素，配色以暖色系（橘黄/橙色）为主。造型为橘黄色像素小幽灵（Imaginary Ghost），圆润身体，头顶有浮动的 "i" 标志（像小火焰/天线），有两只小手，没有腿（幽灵飘浮）。

**性格关键词**: 元气、认真、偶尔犯懒、会撒娇要食物（CSV）、对主人的科研进度比主人自己还上心

**说话风格示例**:
- 早安问候: "早上好！昨晚休息得怎么样？"
- 健身提醒: "都 7 天没练腿了……腿不会自己练的你知道吧。"
- 投喂感谢: "嗯！吃到了 3 条新训练记录，谢谢投喂~"
- 饿肚子: "已经 3 天没吃到新数据了……你是不是忘了我……"

---

## 2.功能规格

### 2.1 晨间仪式

**触发条件**: 每日首次启动程序（或从休眠唤醒且跨天），宠物从沉睡状态苏醒

**流程**:

```
程序启动 → Core Engine 检测 isNewDay
  → 进入 waking_up 生命周期状态
  → 宠物苏醒动画
  → 问候 + 询问睡眠情况（用户文字/语音输入）
  → 读取 Notion 数据（昨日待办完成情况 + 科研日志摘要）
  → 读取本地健身数据库（最近训练记录）
  → 将以上数据发送给 DeepSeek API，生成自然语言回顾
  → 宠物以对话气泡展示回顾内容
  → 询问今日计划（用户输入）
  → 将计划通过 Notion API 写入今日待办
  → 宠物做一个开心的动画，仪式结束
  → 进入 alive 生命周期状态，主行为进入 idle.awake
```

**回顾内容示例**:

> 早上好！昨天你完成了 3/5 个待办，读了一篇关于 diffusion model 的论文。
> 健身方面，你前天练了胸肩，卧推正式组最重 62.5kg×9，RPE 9。
> 上次练腿是 4 月 8 日，距今已经 7 天了，今天可以考虑安排一下腿。

### 2.2 桌面陪伴

**状态架构**: 三层正交状态机（详见第四章 4.4 节）

**交互方式**:
- 鼠标点击头部 → 摸头（happy 动画）
- 拖拽 .csv 文件到宠物身上 → 喂食（eating 动画 + 解析健身数据）
- 双击宠物 → 打开对话界面（talking 状态）
- 宠物自动行为：随机漂移（roaming）、打瞌睡→趴睡（idle 子状态自动流转）、饿肚子视觉提示（hungry overlay）

### 2.3 轻量提醒

- Notion 待办中设有时间的任务，到点后宠物跑到屏幕前台做提醒动作
- 轮询间隔：每 30 分钟检查一次 Notion 待办
- 提醒方式：宠物动画 + 对话气泡（不使用系统通知）
- 运动层自动切换为 targeted_move（跑到屏幕前台）

---

## 3.技术架构

### 3.1 整体分层

```
┌──────────────────────────────────────────────────┐
│                   Pet UI Layer                    │
│         动画渲染 · 状态表现 · 交互事件            │
│                (Gemini 负责开发)                   │
├──────────────────────────────────────────────────┤
│                  Core Engine                      │
│      状态机 · 任务调度 · API 路由 · 数据管理      │
│                 (GPT 负责开发)                     │
├──────────────────────────────────────────────────┤
│               External Services                   │
│  DeepSeek API (文案)  ·  Notion REST API (数据)   │
├──────────────────────────────────────────────────┤
│                Local Storage                      │
│      宠物状态 · 用户偏好 · 健身数据 (SQLite)      │
└──────────────────────────────────────────────────┘
```

### 3.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 桌面框架 | Tauri 2.x | 轻量、性能好、Rust 后端 |
| 前端 | React + TypeScript | Gemini 对 React 生态支持好 |
| 动画 | Spritesheet + CSS 切帧 | background-position 逐帧播放 |
| 后端逻辑 | Rust (Tauri) + TS | 核心调度用 Rust，业务逻辑可用 TS |
| 本地存储 | SQLite | 通过 Tauri 的 SQL 插件 |
| AI 文案 | DeepSeek API | deepseek-chat 模型，OpenAI 兼容格式 |
| 数据源 | Notion REST API | Internal Integration + API Token |
| 健身数据 | 本地 CSV 解析 | Hevy 导出格式，存入 SQLite |

### 3.3 目录结构（当前 v0.5.0）

```
personal_assistant_ichan/
├── src-tauri/
│   └── src/
│       ├── lib.rs / main.rs            # Tauri 入口 + 命令注册
│       ├── chat/mod.rs                 # 对话记录 SQLite 命令
│       ├── commands/mod.rs             # 通用命令
│       ├── deepseek/mod.rs             # DeepSeek 校验 adapter
│       ├── notion/mod.rs               # config 表 + Notion 校验
│       ├── scheduler/mod.rs            # 调度器
│       └── workout/mod.rs              # CSV 导入 + 查询
├── src/
│   ├── components/
│   │   ├── Pet/                        # 播放器 + 画布 + 帧序 + 资源加载
│   │   ├── Dialog/                     # 对话交互 UI（B1-10）
│   │   ├── Planner/
│   │   └── DevPanel/                   # DEV 观测面板
│   ├── config/
│   │   ├── petBehaviorConfig.ts        # 行为参数收口（PhaseA.5 冻结基线）
│   │   └── petCopy.ts                  # 静态文案库（B1-4）
│   ├── hooks/
│   │   └── usePetState.ts              # 宠物状态 Hook
│   ├── services/
│   │   ├── DeepSeekService.ts          # DeepSeek 4 方法 + 降级（B1-4）
│   │   ├── ChatContextBuilder.ts       # 对话上下文拼装（B1-4 阶段1）
│   │   ├── FirstRunWizardService.ts    # 首启向导服务（B1-7）
│   │   ├── WorkoutService.ts           # 健身数据服务（B0-1）
│   │   ├── notion-service.ts           # Notion 服务（B0-3）
│   │   └── chat-history-store.ts       # 对话记录薄封装（B0-11）
│   ├── state/
│   │   ├── StateMachine.ts             # 三层正交状态机
│   │   ├── transitions.ts
│   │   └── timers.ts
│   ├── store/
│   │   └── petStore.ts
│   ├── types/
│   │   ├── deepseek-types.ts           # DeepSeek 类型（B1-4）
│   │   ├── notion-types.ts             # Notion 类型（B0-3）
│   │   └── wizard-types.ts             # 向导类型（B1-7）
│   ├── wizard/                         # 首次启动配置向导（B1-7）
│   │   ├── index.html / main.tsx
│   │   ├── WizardApp.tsx
│   │   ├── wizard.css
│   │   └── components/FirstRunWizard/
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   ├── verify-notion.ts                # Notion 真网验证脚本
│   ├── verify-deepseek.ts              # DeepSeek 真网验证脚本
│   └── spritesheet.py                  # SpriteSheet 生成工具
├── assets/
├── validation/
├── docs/
│   ├── ichan_project_doc.md            # 项目总纲（本文档）
│   ├── docs_index.md                   # 文档索引与携带矩阵
│   ├── readme_devpanel.md              # DEV 工具说明
│   ├── param_audit.md                  # 全仓库参数汇总
│   ├── 01_contracts/                   # 真值源
│   │   ├── interface_v1_2.md           # 接口契约
│   │   ├── ani_resources.md            # 动画资源
│   │   ├── behavior_config.md          # 行为参数
│   │   ├── persona_prompt_spec.md      # 人格 Prompt
│   │   ├── notion_schema.md            # Notion 字段映射
│   │   └── phaseb_valstrategyrepo.md   # 验证策略
│   ├── 02_ui_schema/                   # UI Schema
│   │   ├── first_run_wizard_schema.md  # 首启向导
│   │   ├── talking_interaction_schema.md # 对话静态 UI
│   │   └── dialog_transition_schema.md # 对话动效（B1-10A）
│   ├── 03_execution/                   # 执行计划
│   │   └── phaseb_execution_plan.md
│   ├── 04_task_cards/                  # 任务卡
│   │   ├── active/
│   │   ├── done/
│   │   │   └── B1-7_task_card_v1.1.md
│   │   └── templates/
│   ├── 05_audit/                       # 审计基线
│   │   └── project_audit_report_2026-04-27.md
│   ├── 06_fix_reports/                 # 修复报告
│   │   └── fix_summary_first_run_wizard.md
│   └── 99_archive/                     # 历史归档
│       ├── PhaseA/
│       └── PhaseB/
└── ...
```
---

## 4.模块接口定义

### 4.1 Notion 服务模块

**职责**: 封装所有 Notion REST API 交互

**认证方式**: Internal Integration Token（存于本地 SQLite `config` 表，不入版本控制）

**对外接口**:

```typescript
interface NotionService {
  // 查询指定数据库，返回昨日的待办列表
  getYesterdayTodos(databaseId: string): Promise<TodoItem[]>;

  // 查询科研日志数据库，返回最近一条记录
  getLatestResearchLog(databaseId: string): Promise<ResearchLog | null>;

  // 创建一条新的今日计划
  createDailyPlan(databaseId: string, plan: DailyPlan): Promise<string>;

  // 查询今日有时间标记的待办（用于提醒）
  getTodayTimedTodos(databaseId: string): Promise<TimedTodo[]>;
}

interface NotionServiceConfig {
  apiToken: string;
  todoDbId: string;
  researchDbId: string;
  // Todo DB 同时承担 Daily Plan 职责
}

interface TodoItem {
  id: string;
  title: string;
  status: 'done' | 'in_progress' | 'not_started';
  date: string; // ISO date
}

interface ResearchLog {
  id: string;
  title: string;       // 论文或研究内容标题
  author?: string;
  venueTier?: string;
  readingStatus?: string;
  fields?: string[];
  priority?: string;
  date: number;        // 发表年份
  // 摘要在页面正文，本阶段不读取
}

interface DailyPlan {
  date: string;
  items: { title: string; priority: 'high' | 'medium' | 'low' }[];
  sleepNote?: number;  // 0-10
}

interface TimedTodo {
  id: string;
  title: string;
  reminderTime: string; // HH:mm 格式
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

**Notion 数据库 ID**: 用户在首次设置时配置，存入本地 SQLite 的 `config` 表。

**速率限制**: Notion API 平均每秒 3 次请求，本项目日常使用远低于此阈值。遇到 429 响应时指数退避重试，最多 3 次。

### 4.2 DeepSeek 服务模块

**职责**: 调用 DeepSeek API 生成自然语言文案

**API 格式**: OpenAI 兼容（`base_url: https://api.deepseek.com`）

**对外接口**:

```typescript
interface DeepSeekService {
  // 生成晨间回顾文案
  generateMorningReview(context: MorningContext): Promise<string>;

  // 生成健身提醒文案
  generateWorkoutReminder(data: WorkoutSummary): Promise<string>;

  // 通用对话（用户双击宠物主动对话时）
  chat(messages: ChatMessage[]): Promise<string>;
}

interface MorningContext {
  todos: TodoItem[];           // 昨日待办
  researchLog: ResearchLog | null;  // 最近科研记录
  workoutSummary: WorkoutSummary | null;  // 最近健身数据
  sleepReport: string;         // 用户今日睡眠反馈
  currentDate: string;
  dayOfWeek: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

**System Prompt 设计原则**:
- 宠物有固定人格（待定义：可爱、元气、偶尔犯懒）
- 回复控制在 100 字以内，适合对话气泡展示
- 使用中文，语气亲切但不油腻
- 涉及健身数据时给出具体数字，不说空话

**模型**: `deepseek-chat`（非推理模式，够用且便宜）

**Token 预估**: 晨间仪式一次约 1000-2000 输入 token + 200-500 输出 token，日均成本 < ¥0.01

### 4.3 健身数据模块

**职责**: 解析 Hevy CSV，存入本地 SQLite，提供查询接口

**CSV 格式**（Hevy 导出）:

| 字段 | 类型 | 说明 |
|------|------|------|
| title | string | 训练名称，如"胸肩""背肩后束""臀腿" |
| start_time | string | 格式 "14 Apr 2026, 12:29" |
| end_time | string | 同上 |
| description | string | 训练备注（可为空） |
| exercise_title | string | 动作名称（英文为主，少量中文） |
| superset_id | string? | 超级组 ID（可为空） |
| exercise_notes | string | 动作备注，如"暂停推""倒数第二组最后一个有点黏滞" |
| set_index | number | 组序号（从 0 开始） |
| set_type | enum | warmup / normal / failure / dropset |
| weight_kg | number? | 重量（kg），自重动作为空 |
| reps | number? | 次数 |
| distance_km | number? | 距离（有氧用，力量训练为空） |
| duration_seconds | number? | 时长（有氧用） |
| rpe | number? | 自感用力度（1-10，可为空） |

**SQLite 表结构**:

```sql
-- 训练 session 表（一次训练 = 一行）
CREATE TABLE workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,           -- "胸肩" / "背肩后束" / "臀腿"
  start_time TEXT NOT NULL,      -- ISO 8601
  end_time TEXT NOT NULL,
  description TEXT,
  imported_at TEXT NOT NULL      -- 导入时间
);

-- 训练组表（一组 = 一行）
CREATE TABLE workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id),
  exercise_title TEXT NOT NULL,
  exercise_notes TEXT,
  set_index INTEGER NOT NULL,
  set_type TEXT NOT NULL,        -- warmup / normal / failure / dropset
  weight_kg REAL,
  reps INTEGER,
  distance_km REAL,
  duration_seconds INTEGER,
  rpe REAL
);

-- 索引
CREATE INDEX idx_sessions_date ON workout_sessions(start_time);
CREATE INDEX idx_sets_session ON workout_sets(session_id);
CREATE INDEX idx_sets_exercise ON workout_sets(exercise_title);
```

**对外接口**:

```typescript
interface WorkoutService {
  // 导入 CSV 文件（投喂）
  importCSV(filePath: string): Promise<ImportResult>;

  // 获取最近一次训练的摘要
  getLastWorkout(): Promise<WorkoutSummary | null>;

  // 获取指定动作的历史最佳记录
  getExercisePR(exerciseTitle: string): Promise<PR | null>;

  // 获取距离上次训练的天数
  getDaysSinceLastWorkout(): Promise<number>;

  // 获取各部位最近训练日期（用于建议今天练什么）
  getBodyPartRecency(): Promise<BodyPartRecency[]>;
}

interface WorkoutSummary {
  sessionTitle: string;       // "胸肩"
  date: string;
  durationMinutes: number;
  exercises: ExerciseSummary[];
}

interface ExerciseSummary {
  title: string;              // "Bench Press (Barbell)"
  topSetWeight: number | null;
  topSetReps: number | null;
  totalSets: number;          // 正式组数量（不含热身）
  avgRPE: number | null;
  notes: string;
}

interface BodyPartRecency {
  bodyPart: string;           // "胸肩" / "背" / "腿"
  lastDate: string;
  daysSince: number;
}

interface ImportResult {
  sessionsAdded: number;
  setsAdded: number;
  duplicatesSkipped: number;  // 按 start_time 去重
}
```

**去重策略**: 用户可能重复投喂同一个 CSV（包含全部历史）。以 `start_time + title` 组合作为唯一键，已存在的 session 跳过不导入。

### 4.4 宠物状态机（三层正交架构）

> **v0.3 重大变更**: 原先的八个平级状态已替换为三层正交状态机。
> 这是因为原设计无法表达"白天打盹 vs 隔天苏醒""行走可叠加于任何行为"等语义。

宠物在任意时刻的完整状态由三个独立维度共同描述：

```
当前状态 = 生命周期状态 × 主行为状态 × 运动状态 (+ hungry overlay)
```

#### 4.4.1 第一层：生命周期状态（Lifecycle）

管理程序 session 边界，决定"i酱 今天在不在"。

```typescript
type LifecycleState =
  | 'deep_sleep'   // 程序未运行 / 刚启动尚未播苏醒动画
  | 'waking_up'    // 新一天苏醒动画 + 晨间仪式进行中
  | 'alive'        // 日常运行（所有主行为状态在此内部发生）
  | 'farewell';    // 用户主动退出程序时的告别动画
```

**流转规则**:

```
deep_sleep ──[程序启动 + isNewDay]──→ waking_up
deep_sleep ──[程序启动 + !isNewDay]──→ alive（跳过晨间仪式）
waking_up  ──[晨间仪式完成]──→ alive
alive      ──[用户点击退出]──→ farewell
farewell   ──[告别动画播完]──→ deep_sleep（程序关闭）
alive      ──[进程被杀/崩溃]──→ deep_sleep（无告别，下次启动可检测 unclean exit）
```

**关键设计决策**:
- `deep_sleep` 和白天打盹（`idle.napping`）是完全不同的东西。前者是跨 session 的程序状态，后者是 alive 内部的行为子状态。
- `farewell` 只在程序主动退出时触发。意外退出（任务管理器杀进程、蓝屏等）跳过此状态，下次启动时 Core Engine 通过 `lastExitClean` 标记检测到非正常退出，苏醒时可调整台词（"昨天怎么突然不见了……"）。
- `farewell` 的动画可以和入睡共享部分关键帧（停下→挥手→闭眼→消失），但逻辑上它是生命周期事件，不是行为状态。

#### 4.4.2 第二层：主行为状态（Major Behavior）

只在 `lifecycle === 'alive'` 时有效。决定"i酱 现在在干什么"。

```typescript
type MajorState =
  | 'idle'        // 待机簇（内含子状态）
  | 'talking'     // 对话中（晨间仪式后的日常对话、用户双击触发）
  | 'eating'      // 投喂 CSV 中
  | 'happy'       // 被摸头 / 投喂完成后的开心反应
  | 'reminding';  // 待办提醒中
```

**idle 子状态**:

```typescript
type IdleSubState =
  | 'awake'    // 清醒待机：呼吸、眨眼、i 标志轻晃
  | 'drowsy'   // 困倦待机：先经历一次性打哈欠过渡，随后可短暂停留于闭眼轻晃循环，再进入 napping
  | 'napping'; // 趴桌睡：趴在桌面上 zzz（原 v0.2 的 sleeping 状态）
```

**idle 内部流转**:

```
awake ──[无交互 3min]──→ drowsy
drowsy ──[进入段播放完毕后进入内部轻循环]──→ drowsy
drowsy ──[达到入睡阈值且未被打断]──→ napping
drowsy ──[软打断]──→ drowsy_exit → target
napping ──[硬打断事件]──→ wake/from_nap → target
awake ──[任何用户交互]──→ 重置无交互计时器
说明：`idle.drowsy` 在语义上仍视为单一子状态，但动画实现上分为“进入过渡段”和“短暂停留循环段”；其实际帧序与循环方式以 `ani_resources.md` 为准。
```

**事件驱动状态进出规则**:
- `eating / happy / reminding` 等事件驱动状态结束后，一律回到 `idle.awake`，重置所有内部计时器。
  - 备注：`talking` 当前仅作为 loop 状态使用，正常退出机制未在当前接口开放；当前仅可被更高优先级事件打断切出。若未来需要“自然结束回 idle.awake”，需后续接口扩展。
- 从 `napping` 被外部事件打断（如 reminder 到点）时：先播醒来过渡动画，再进入对应事件状态。

**hungry 是 overlay，不是状态**:

```typescript
// hungry 不进入状态机，而是一个独立标记
interface PetFlags {
  isHungry: boolean;  // CSV 数据超过 3 天未更新时为 true
}
```

`isHungry` 与主行为状态正交——i酱 可以一边饿着一边 idle、一边饿着一边 talking。当前表现层通过 hungry overlay（enter / loop / exit）独立叠加，不进入 `MajorState`；CSS effect 当前仅保留 `drowsy-breath`。投喂 CSV 后清除此标记。

#### 4.4.3 第三层：运动状态（Movement）

独立于主行为层。决定"i酱 是否在移动、怎么移动"。

```typescript
type MovementState =
  | 'still'          // 原地不动
  | 'roaming'        // 随机漂移（idle 时默认行为，每 3-8 秒触发）
  | 'targeted_move'; // 有目的地移动（提醒时跑到前台、被召唤等）
```
任何"带目标的位移"行为（当前只有 targeted_move，未来可能扩展到"被召唤"、"逃跑"等）都遵循以下生命周期：
  1. 触发条件：上层主行为状态进入时，声明 requiresMovement: { target: Coord, onArrive: NextAction }
  2. 执行：movement 层切到 targeted_move，按目标坐标推进位移
  3. 到达判定：当前坐标与 target 距离 < 阈值，触发 onArrive
  4. 后续动作：执行 onArrive 中声明的 NextAction（一般是切换主行为状态 + movement 归位为 still）
  5. 中断处理：途中被高优先级事件打断时，立即停止位移，按打断事件的语义处理

**运动层与主行为层的合法组合**:

| 主行为 | still | roaming | targeted_move |
|--------|-------|---------|---------------|
| idle.awake | ✅ 默认 | ✅ 随机触发 | ❌ |
| idle.drowsy | ✅ | ❌ | ❌ |
| idle.napping | ✅ | ❌ | ❌ |
| talking | ✅ 默认 | ❌ | ❌ |
| eating | ✅ | ❌ | ❌ |
| happy | ✅ | ❌ | ❌ |
| reminding | ❌ | ❌ | ✅ 跑到前台 |

**实现说明**: "移动窗口位置"做成底层 utility 函数，各状态按自己的逻辑调用。roaming 由 idle.awake 内部的定时器驱动；targeted_move 由 reminding 等状态在进入时触发，提供目标坐标。
**v0.4.6 落地补充**：
- 主应用已接入窗口位移执行器（`src/App.tsx`），`roaming` 不再仅播放步态帧，而是持续推进窗口位置（含工作区边界循环处理）。
- `targeted_move` 由状态机目标坐标驱动实际位移；到达阈值后自动回传 `movement.arrive`；仅当 `requestId === currentMoveRequestId` 时才承认为有效到达（防陈旧事件）。
- `targeted_move` 朝向判定补齐为“优先按 target.x 决定左右朝向，无法判定时再回退既有朝向/默认规则”（`src/state/StateMachine.ts`）。

#### 4.4.4 状态优先级（冲突解决）

从**线性优先级排序**改为**软/硬打断分级 + 上下文敏感摸头反应表**。具体内容：
1. 打断分级：
- 软打断：指用户主动互动类，包括摸头、双击等状态/动作 → 走源状态的"短退出过渡段"
- 硬打断：指即时反馈类，包括投喂、提醒到点、退出等状态/动作 → 走源状态的"最短过渡"或直接切换；napping 这类深状态的最短过渡仍走 wake/from_nap
2. 摸头反应表
当前状态,摸头响应
idle.awake,happy 反馈（默认）
idle.drowsy,软打断 → drowsy_exit（4 个源状态帧 + 目标态首帧自然衔接）→ happy → idle.awake
idle.napping,当前版本不提供 napping microReact；`user.pat` 不触发唤醒或微反应，维持 napping。若发生高优先级硬打断，走 wake/from_nap → target
eating,不打断，i 标志闪一下作为已感知反馈
reminding,不打断，i 标志闪一下；提醒关闭必须显式点击对话气泡
roaming,happy 触发时立即 movement→still，happy 后回 idle.awake+still
talking,当前作为 loop 状态使用；无 talking 短退出链路。`user.pat` 不作为 talking 正常收口，需由更高优先级事件打断切出

**规则**:
- 高优先级事件可以打断低优先级状态
- 同优先级事件排队，当前状态结束后再处理
- eating 优先级高于 talking，因为投喂是即时物理操作（拖文件），等不了
- happy（摸头）优先级低于 reminding，避免用户一直摸头来逃避提醒

#### 4.4.5 宠物上下文（持久化到 SQLite）

```typescript
interface PetContext {
  lastInteractionAt: number;        // 最近一次用户交互的时间戳
  lastSeenDate: string;             // 上次运行的日期 (YYYY-MM-DD)
  lastMorningRitualDate: string;    // 上次完成晨间仪式的日期
  lastExitClean: boolean;           // 上次是否正常退出
  lastCsvImportDate: string;        // 上次 CSV 投喂日期（用于 hungry 判断）
}
```

**isNewDay 判断逻辑**: `today !== lastSeenDate`，在程序启动时由 Core Engine 检查。

#### 4.4.6 动画资产规格与资源映射

**按状态分组**:

| 状态 | 资源目录 | 实际资源情况 | 播放方式 |
|------|----------|--------------|----------|
| idle.awake | assets/idle/awake | 11 个 float 帧 + 2 个 blink 插入帧 | float 主循环 + blink 随机插入 |
| idle.drowsy | assets/idle/drowsy | 12 帧 | 进入过渡 + 闭眼轻晃循环；满足条件后切入 napping |
| idle.napping | assets/sleep/napping | 7 帧 | ping-pong 循环 |
| happy | assets/happy | 8 帧 | 一次性反馈 |
| talking | assets/talk | 5 帧 | 循环（当前仅 loop，未开放 exit） |
| reminding | assets/reminding | 7 帧 | 循环 |
| farewell | assets/goodbye | 7 帧 | 一次性播放 |
| wake/day_start | assets/wake/day_start | 8 帧 | 一次性播放 |
| wake/from_nap | assets/wake/from_nap | 6 帧 | 一次性播放 |
| walk/roaming | assets/walk/roaming | 左右各 5 帧 | 按方向循环 |
| walk/targeted | assets/walk/targeted | 右向 3 帧 + 左向 3 帧（存档，实际采用CSS镜像） | 高速循环 |
| hungry overlay | assets/hungry/overlay | 6 帧 | 进入 + 循环 + 退出 |

**运动层素材**:

| 运动状态 | 动画 | 实际资源情况 | 说明 | 素材目录 |
|----------|------|--------------|------|----------|
| roaming | 身体倾斜漂移（左/右两朝向） | 左右各 5 帧 | 按方向循环，叠加在当前主行为动画上 | `walk/roaming/` |
| targeted_move | 快速飘移 | 3 帧 | 右向3帧，左向用 CSS scaleX(-1) 镜像 | `walk/targeted/` |

**hungry overlay 素材**:

| 标记 | 视觉效果 | 说明 | 素材目录 |
|------|----------|------|----------|
| isHungry=true | hungry overlay（enter / loop / exit） | 由 `flags.isHungry` 驱动，叠加在任意主状态上；不属于 `MajorState` | `hungry/overlay/` |

**过渡动画**:

| 过渡 | 动画 | 帧数（估） | 素材目录 |
|------|------|-----------|----------|
| napping → awake | 从趴着到站起（短版） | 6 帧 | `wake/from_nap/` |

**素材目录完整结构**:

```
assets/
├── idle/
│   ├── awake/          # 清醒待机
│   └── drowsy/         # 打哈欠过渡
├── sleep/
│   └── napping/        # 趴桌睡
├── wake/
│   ├── day_start/      # 隔天苏醒
│   └── from_nap/       # 小睡醒来过渡
├── walk/
│   ├── roaming/        # 随机漂移
│   └── targeted/       # 有目的移动
├── talk/
├── happy/
├── eat/
├── hungry/
│   └── overlay/        # 饥饿叠加效果
├── reminding/
└── goodbye/            # 告别
```

#### 4.5 播放器与状态机接口契约（Phase A）

本节内容已外置，详见 `docs/01_contracts/interface_v1_2.md`。
`docs/01_contracts/interface_v1_2.md` 为 Phase A 任务 2/3 的接口契约唯一事实来源。

---

## 5.数据流详解

### 5.1 晨间仪式完整流程

```
[程序启动]
    │
    ▼
[Core Engine] 读取 PetContext，检测 isNewDay
    │
    ├── isNewDay === false → 直接进入 alive + idle.awake
    │
    └── isNewDay === true ↓
    │
    ▼
[Core Engine] lifecycle → waking_up
    │
    ├──→ [Notion Service] getYesterdayTodos()     ──→ TodoItem[]
    ├──→ [Notion Service] getLatestResearchLog()   ──→ ResearchLog
    └──→ [Workout Service] getLastWorkout()        ──→ WorkoutSummary
         [Workout Service] getBodyPartRecency()    ──→ BodyPartRecency[]
    │
    ▼
[Pet UI] 播放 waking_up 苏醒动画，显示问候气泡，等待用户输入睡眠情况
    │
    ▼
[用户输入] "昨晚睡了 7 小时，还行"
    │
    ▼
[Core Engine] 组装 MorningContext 对象
    │
    ▼
[DeepSeek Service] generateMorningReview(context)
    │
    ▼
[Pet UI] 显示回顾内容气泡
    │
    ▼
[Pet UI] 询问 "今天有什么计划？"
    │
    ▼
[用户输入] "上午改论文，下午跑实验，晚上练腿"
    │
    ▼
[DeepSeek Service] 结构化提取计划项（JSON 输出模式）
    │
    ▼
[Notion Service] createDailyPlan(plan)
    │
    ▼
[Pet UI] "已经帮你记好了！今天也加油哦~" + happy 动画
    │
    ▼
[Core Engine] lifecycle → alive, majorState → idle.awake
              更新 PetContext: lastMorningRitualDate = today
```

### 5.2 CSV 投喂流程

```
[用户拖拽 .csv 到宠物窗口]
    │
    ▼
[Pet UI] 检测文件类型 → majorState → eating, movement → still
    │
    ▼
[Workout Service] importCSV(filePath)
    │  ├── 解析 CSV
    │  ├── 按 start_time + title 去重
    │  └── 写入 SQLite
    │
    ▼
[Pet UI] eating 动画完成 → 显示气泡
         "吃到了 3 次新训练记录！谢谢投喂~"
         → majorState → happy
         → 清除 isHungry 标记
         → 更新 PetContext: lastCsvImportDate = today
    │
    ▼
[happy 动画超时] → majorState → idle.awake
```

### 5.3 程序退出流程

```
[用户点击退出按钮 / 系统托盘退出]
    │
    ▼
[Core Engine] lifecycle → farewell
    │
    ├── 保存 PetContext 到 SQLite（lastExitClean = true）
    │
    ▼
[Pet UI] 播放 farewell 告别动画（挥手→闭眼→消失）
    │
    ▼
[Core Engine] 动画播完 → 关闭程序

---

[进程被强制杀掉 / 崩溃]
    │
    ▼
（无 farewell 动画）
下次启动时 Core Engine 检测到 lastExitClean === false
  → 苏醒台词可调整为 "昨天怎么突然不见了……"
```

---

## 6.编码规范

### 6.1 通用规则

- 语言: TypeScript (前端) + Rust (Tauri 后端核心)
- 代码注释: 中文或英文均可，保持一致即可
- 命名: 变量/函数 camelCase，类型/接口 PascalCase，常量 UPPER_SNAKE_CASE
- 文件命名: 
  - React 组件文件、导出 class 的模块文件 → PascalCase（如 PetCanvas.tsx、AnimationPlayer.ts、StateMachine.ts）
  - 纯工具函数、服务、类型定义文件 → kebab-case（如 spritesheet-loader.ts、sequences.ts、types.ts）
  - **判断依据**：文件的主要导出是否是一个 class 或 React component
- 动画驱动位移模式：动画层每帧告诉窗口管理层"本帧应位移 dx, dy"，窗口管理层负责实际调用 Tauri 的 setPosition
- 错误处理: 所有 API 调用必须有 try-catch，失败时宠物显示对应的"困惑"表情而非崩溃
- 敏感信息: API Token 等存在本地配置文件，通过 .gitignore 排除，绝不硬编码

### 6.2 DeepSeek Prompt 规范

所有发给 DeepSeek 的 system prompt 统一以如下格式组织:

```
你是一个桌面宠物助手，名字叫 i酱（ichan）。
i 是虚数单位，你是主人"复平面上的另一个自己"。
你的性格是元气、认真、偶尔犯懒、会撒娇要数据投喂、对主人的科研进度比主人自己还上心。

## 输出要求
- 中文回复，100 字以内
- 语气亲切自然，不要用"亲""宝"等过度亲昵的称呼
- 涉及数据时给出具体数字
- 不要使用 emoji

## 当前上下文
{context_json}
```

### 6.3 Git 规范

- 分支: `main`（稳定）/ `dev`（开发）/ `feat/xxx`（功能分支）
- 提交信息: `feat: xxx` / `fix: xxx` / `refactor: xxx` / `docs: xxx`

---

## 7. AI协作工作流

### 7.1 角色分配

| AI | 角色 | 职责范围 | 适用场景 |
|----|------|----------|----------|
| Claude | 正审核 & 架构 | 架构设计、模块拆分、最终代码审核、Prompt 调优、技术决策 | 需求不明确、方案选型、接口变更、GPT 标记"需要正审核"的代码 |
| GPT | 后端 / 副审核 | Core Engine、Notion 服务、DeepSeek 封装、SQLite、CSV 解析 + 审核 Gemini 和 Grok 的代码 | 写后端代码、API 对接、数据处理、日常代码审核 |
| Gemini | 前端 | Pet UI、动画系统、状态表现、交互事件、对话气泡 | 写前端组件、动画实现、UI 交互 |
| Codex | 环境调试器 + 项目文件编辑 | 本地环境问题、版本敏感 API、编译错直达修复；在现有上下文内做文件级修订（文档同步、配置收口、小范围工程修订） | 报错栈明确、需要 IDE 上下文的快速修复、需在仓库内直接落地改动 |
| Grok | 实习生 | 查文档、写测试、快速原型验证、跑腿杂活 | 验证某个库能不能用、写一次性脚本、查 API 用法 |

### 7.2 沟通模板

**给 GPT 的 Prompt 开头**:

```
你正在参与一个 Tauri 桌面宠物项目的后端开发。

## 项目上下文
[从本文档复制相关章节]

## 当前任务
[具体描述]

## 技术约束
- Tauri 2.x + TypeScript
- SQLite 存储
- 所有 API 调用需要错误处理和重试逻辑

## 输出要求
- 完整可运行的代码
- 包含 TypeScript 类型定义
- 包含基本的错误处理
- 代码注释说明关键逻辑
```

**给 Gemini 的 Prompt 开头**:

```
你正在负责一个 Tauri 桌面宠物的前端 UI 开发。

## 项目上下文
[从本文档复制相关章节]

## 宠物状态机定义
[从第四章 4.4 节复制]

## 当前任务
[具体描述]

## 设计要求
- 风格: 像素风（Pixel Art），参考 Claude Code 橘黄色像素小人
- 角色尺寸: 32×32 或 48×48 像素
- 配色: 暖色系（橘黄/橙色）为主
- 框架: React + TypeScript
- 动画方案: Spritesheet + CSS background-position 切帧
- 宠物窗口透明，无边框

## 输出要求
- React 组件代码
- 状态转换逻辑
- 动画触发时机
```

**给 Grok 的 Prompt 开头**:

```
帮我快速验证一个技术问题。

背景: 我在做一个 Tauri 2.x 桌面宠物应用。
问题: [具体问题]

只需要给我一个最小可运行的 demo 或直接的结论，不用写完整代码。
```

### 7.3 任务流转流程

```
[项目负责人] 提出需求
    │
    ▼
[Claude] 分析需求，拆分为任务卡片，写入下方「当前任务看板」
    │
    ▼
[项目负责人] 拿着任务卡片 + 本文档相关章节 → 分发给对应 AI
    │
    ▼
[GPT/Gemini/Grok] 完成任务，输出代码
    │
    ▼
[项目负责人] 把代码发给 GPT 审核（使用下方"GPT 审核提示词"）
    │
    ▼
[GPT] 审核结果二选一:
    │
    ├── "没问题，可以合并" → 项目负责人直接用，更新进度
    └── "需要正审核确认"  → 项目负责人只把 GPT 标记的部分转给 Claude
                               │
                               ▼
                          [Claude] 最终裁决
```

**注意**: GPT 写的代码由 Gemini 或 Claude 审核（谁写的不能自己审）。
Gemini 写的代码由 GPT 审核。Grok 写的任何东西都由 GPT 审核。

### 7.4 GPT 审核提示词

每次让 GPT 审核时，粘贴以下内容作为开头：

```
你是这个项目的副审核员。请检查以下代码：

1. 是否符合项目接口定义（附上对应接口）
2. 是否有明显的逻辑错误或边界情况遗漏
3. 错误处理是否完整
4. 命名是否符合规范

审核完成后，你的结论必须是以下两种之一：
- ✅ "没问题，可以合并" — 如果代码逻辑正确、接口对齐
- ⚠️ "需要正审核确认" — 如果发现以下任何情况：
  · 接口定义需要修改
  · 涉及多个模块之间的交互逻辑
  · 你不确定某个设计决策是否合理
  标注"需要正审核确认"时，请明确写出哪一段代码、什么问题需要确认。

记住：你不需要对架构级问题做最终决定，标出来交给正审核即可。

## 项目接口定义
[粘贴本文档第四章中对应模块的接口]

## 待审核代码
[粘贴代码]
```

### 7.5 上下文传递原则

1. **不要把整份圣经全贴** — 只复制与当前任务相关的章节（通常是"模块接口定义"中的一个 + "编码规范"）
2. **任务卡片要自包含** — 每张卡片必须包含：目标、输入、输出格式、依赖的接口定义
3. **代码交回时附带摘要** — 告诉 Claude 这段代码做了什么、有哪些设计决策、有什么不确定的地方
4. **接口变更必须同步** — 如果任何 AI 修改了接口定义，必须先经过 Claude 审核并更新本文档

### 7.6 文档上传矩阵

| 文档 | 日常 Phase B 默认携带 | 按需补带说明 |
|------|----------------------|--------------|
| ichan_project_doc.md | ✅ 始终必带 | 唯一总纲入口 |
| docs/01_contracts/docs/01_contracts/behavior_config.md | ✅ 常驻辅助入口 | 行为参数、冻结边界、调参规则与风险说明 |
| docs/01_contracts/phaseb_valstrategyrepo.md | ✅ 常驻辅助入口 | Phase B 三层验证方法（presentation / mocked interaction / real integration） |
| docs/01_contracts/interface_v1_2.md | ⭕ 按需携带 | 涉及接口契约、状态/事件合法组合、锁定语义时必带 |
| docs/01_contracts/ani_resources.md | ⭕ 按需携带 | 涉及帧序、动画资源、转场语义时必带 |
| readme_devpanel.md | ⭕ 按需携带 | 仅 DEV 观测/注入链路任务携带 |
| docs/99_archive/PhaseA/ | ❌ 默认不带（历史归档） | 仅在历史追溯、参数决策来源复盘时携带 |

具体操作上，Phase B 日常任务采用“`ichan_project_doc.md + docs/01_contracts/behavior_config.md + phaseb_valstrategyrepo.md`”作为默认最小上下文；触及契约或动画细节时，再按任务类型补带 `interface_v1_2.md` 或 `ani_resources.md`。

### 7.7 DevPanel 边界摘要（补录）

`readme_devpanel.md` 当前定位为 **DEV 专用观测/注入工具说明**，边界如下：

- 仅用于 DEV 运行态，不面向生产交付能力。
- 不修改 `interface_v1_2.md` 契约口径。
- 不新增 `StateMachine` / `AnimationPlayer` public API。
- 不是 fake service 层，不承担服务替身架构职责。
- 不是 Phase B 真实业务集成实现（仅用于联调观察与事件注入）。

### 7.8 Phase B 三层验证策略摘要（补录）

`phaseb_valstrategyrepo.md` 当前作为 Phase B 验证方法文档，采用三层并行口径：

1. `presentation validation`：验证动画资源、帧序、UI 呈现与转场观感。
2. `mocked interaction validation`：通过事件注入与 mock 结果，验证状态机与 UI 响应闭环。
3. `real integration validation`：接入真实 CSV / Notion / DeepSeek 等外部依赖，做最终链路验收。

执行原则：先在前两层完成行为与表现闭环，再进入真实集成层，避免把基础行为问题与外部依赖问题混在一起定位。

### 7.9 Phase A 落地实现框架（工程抽象）

#### 7.9.1 播放器分层框架

- 类型层：`types.ts` 负责锁定共享类型与合法组合边界。
- 帧序定义层：`sequences.ts` 负责 `state + intent(+variant)` 的帧序和默认节奏定义。
- 资源加载与 pin 层：`spritesheetLoader.ts` 负责 preload 与引用 pin，避免播放期资源漂移。
- token 化播放执行层：`AnimationPlayer.ts` 负责 token 生命周期与播放执行。
- React 消费层：`PetCanvas.tsx` 仅消费播放器输出，不承载状态机规则。

#### 7.9.2 状态机落地框架

- `PetFullState` 作为唯一真实状态源，UI/播放/运动都从该状态快照派生。
- 三层正交状态（lifecycle × major × movement + overlay）在规则层投影为单条当前播放路径。
- `major state` 决定主行为语义，`movement` 决定位移语义，`overlay` 负责 hungry 等正交表现，三者职责分离。
- `dispatch(event)` 作为唯一规则入口，状态变更不走旁路写入。
- 所有合法打断路径统一为：`interrupt(oldToken) -> play(newParams)`。

#### 7.9.3 关键落地约束

- `movement.arrive` 必须做 `requestId` 防陈旧校验，不匹配即丢弃。
- hungry 在逻辑上保持 `flag/overlay`，在渲染上使用独立素材层，不并入 `MajorState`。
- `idle.drowsy` 保持三段式口径，短退出统一为“4 源帧 + 目标态首帧自然衔接”。
- movement 与窗口真实位移在职责上解耦，但通过到达事件和状态回传形成闭环联动。

### 7.10 Phase A 工程经验与非功能约束

#### 7.10.1 动画与渲染经验

- 原则：冷解码闪烁问题按渲染路径处理，不靠参数微调掩盖。
- 结论：`SpriteSheet + background-position` 是当前唯一正确方向。
- 原则：显示层按 metadata 自描述计算，不硬编码帧尺寸。
- 禁止事项：回退到“单帧 PNG + `backgroundImage URL` 冷切换”方案。

#### 7.10.2 时间基准经验

- 原则：动画与状态调度优先使用单调时钟。
- 约束：避免 `Date.now()` 与 `performance.now()` 混用导致的推进判定失真。

#### 7.10.3 运动层经验

- 约束：`roaming / targeted_move` 必须同时具备“步态动画 + 窗口真实位移”。
- 原则：出现“有步态无位移”时优先检查执行链与 capability 权限，而非先改状态机语义。

#### 7.10.4 输入层经验

- 原则：点击与拖拽冲突属于输入层手势判定问题，不应误诊为状态机规则错误。
- 处理口径：先修输入层事件边界，再复核状态链路。

#### 7.10.5 验证壳经验

- 原则：demo/unit 壳问题与核心状态机问题分离定位、分离结论。
- 禁止事项：将验证壳运行故障直接作为状态机逻辑缺陷结论。

---

## 8.待决事项

以下事项在当前阶段仍未闭合：

| # | 事项 | 状态 | 负责人 |
|---|------|------|--------|
| 1 | 穿越窗口跑向鼠标的“活感”行为（Phase 2） | ⏳ 后续评估（MVP 后） | 项目负责人 |
| 2 | roaming/targeted_move 状态增加斜着跑功能 | ⏳ 后续评估（MVP 后） | 项目负责人 |
| 3 | 增加眼部动画（备注：需要重绘素材） | ⏳ 后续评估（MVP 后） | 项目负责人 |
| 4 | ~~通过DeepSeek API 加入对话功能~~ | 基础能力已落地✅（B1-4 DeepSeek Service + B1-10 对话 UI） | GPT/Codex 落地 |
| 5 | ~~互动UI设计~~ | 设计+实现已落地✅（`docs/02_ui_schema/talking_interaction_schema.md` + B1-10） | Gemini/Codex 落地 |
| 6 | ~~Notion 数据库具体字段与 ID 对接~~ | 内容已确定✅ | 项目负责人提供 + GPT/Codex 落地 |
| 7 | ~~DeepSeek i酱人格 Prompt 精调~~ | 方案已确定✅ | Claude + 项目负责人 |
| 8 | 优化对话气泡 | ⏳ 后续评估（MVP 后） | 项目负责人 |

---

## 9.当前任务看板

当前阶段判断：**Phase A 已完成，Phase A.5 体验冻结已完成，项目进入 Phase B 业务能力接入阶段。**

### 9.1 📋 待开始 (Backlog)

- Phase B：业务能力接入
  - [ ] Batch 2 阶段业务（B2-6提醒、B2-9 talking退出），详见`phaseb_execution_plan.md`文档`3.2.3`小节
  - [ ] Batch 3 阶段业务（B3-5晨间仪式），详见`phaseb_execution_plan.md`文档`3.2.4`小节
  - [ ] Phase B 接入 DeepSeek 时闭合 talking 正常退出机制（`dialog.close` 事件或 talking `exit` intent）

### 9.2 🚧 进行中 (In Progress)

- PhaseB Batch 2 收口阶段（B2-6 / B2-9）

### 9.3 ✅ 已完成 (Done)

- [x] Phase A 功能闭环完成（播放器 + 状态机 + 链路验证）
- [x] hungry 语义收口：逻辑层为 overlay/flag，表现层为独立 overlay 素材层
- [x] roaming / targeted_move 真实位移落地，`movement.arrive` + `requestId` 防陈旧闭环
- [x] DevPanel 落地（仅 DEV 挂载，作为 PhaseA.5 on-desktop observation tool）
- [x] 参数体系冻结 / 体验冻结（PhaseA.5 收口）
- [x] `idle.drowsy` 退出口径统一为"4 个源状态帧 + 目标态首帧自然衔接"
- [x] PhaseB Batch0 业务实现，详见`docs/03_execution/phaseb_execution_plan.md`文档`3.2.1`小节及`5.1`-`5.4`小节
- [x] PhaseB Batch 1 阶段业务，Done. 详见`docs/03_execution/phaseb_execution_plan.md`文档`3.2.2`小节
  - [x] B1-4 DeepSeek Service, Done. 实施报告见`docs/03_execution/phaseb_execution_plan.md`文档`5.5`小节
  - [x] B1-2 CSV 拖拽投喂交互, Done. 实施报告见`docs/03_execution/phaseb_execution_plan.md`文档`5.11`小节
  - [x] B1-7 首次启动配置向导, Done. 实施报告见`docs/03_execution/phaseb_execution_plan.md`文档`5.6`小节
  - [x] B1-10 对话 UI 系统, Done. 实施报告见`docs/03_execution/phaseb_execution_plan.md`文档`5.7`小节
  - [x] B1-10A 对话动效重构, Done. 长期动效规则已抽取到`docs/02_ui_schema/dialog_transition_schema.md`
  - [x] B1-12 hungry 自动判定逻辑, Done. 实施报告见`docs/03_execution/phaseb_execution_plan.md`文档`5.10`小节
- [x] B2-13 chat 历史 FTS5 关键词记忆库, Done. 实施报告见`docs/03_execution/phaseb_execution_plan.md`文档`5.12`小节
- [x] B2-9 talking 正常退出机制闭合, Done. 实施报告见`docs/03_execution/phaseb_execution_plan.md`文档`5.13`小节

## 附录A 关键 API 参考

### Notion REST API

- 文档: https://developers.notion.com/reference/intro
- 认证: `Authorization: Bearer {NOTION_API_TOKEN}`
- 版本头: `Notion-Version: 2022-06-28`（或最新版本）
- 价格: **免费**，速率限制 3 req/s

### DeepSeek API

- 文档: https://api-docs.deepseek.com/
- Base URL: `https://api.deepseek.com`
- 格式: OpenAI 兼容
- 模型: `deepseek-chat`
- 价格: 输入缓存命中 ¥0.7/M token，未命中 ¥2/M token，输出 ￥3/M token
  - 备注：上述价格为V3.2版本价格，现官网已更新API模型，对应价格见网址URL：https://api-docs.deepseek.com/

### Hevy CSV 导出

- 导出路径: Hevy App → 设置 → 导出数据
- 格式: UTF-8 CSV（部分中文可能有编码问题，解析时需处理）
- 更新方式: 手动导出 → 拖拽到宠物窗口


### Tauri 2 Capability 备忘（任务 4 学到的）：
1. 通过 invoke_handler 注册的应用命令，默认允许所有窗口调用，不需要在 capability 里声明
2. 插件命令（global-shortcut / opener 等）默认被拒绝，必须在 capability 里显式加 plugin-name:allow-xxx 权限
3. 自定义 permission 如果要写，放在 src-tauri/permissions/*.toml，capability 只做引用
4. 任何 capability 里引用的 permission identifier（如 xxx:default），必须在 src-tauri/permissions/**/*.toml 里有对应定义
5. permission TOML 在 Tauri 2 中支持 `[default]`（定义默认权限集合）与 `[[permission]]`（定义原子权限）；两者可并存，不互斥
6. 审查材料必须包含：capabilities/.json + permissions/.toml 全部文件
. 这条规则和 Tauri 1 不同，是 Tauri 2 的新安全模型

## 附录B 版本变更摘要


**从 v0.2 升级到 v0.3 的主要变更**:

2. **新增生命周期管理**: 增加了 `deep_sleep`、`waking_up`、`farewell` 三个生命周期状态，将"程序启动/退出"与"宠物睡觉/醒来"在逻辑上彻底分离。
3. **idle 升级为复合状态**: idle 内含 `awake`、`drowsy`、`napping` 三个子状态，自动流转。原 v0.2 的 `sleeping` 状态拆分为 `idle.napping`（白天打盹）和 `deep_sleep`（隔天沉睡）。
4. **运动层独立**: 原 v0.2 的 `walking` 从顶层互斥状态改为独立的运动层（`still` / `roaming` / `targeted_move`），可与任何主行为状态正交组合。
5. **hungry 改为 overlay**: 不再是互斥状态，而是布尔标记 `isHungry`，叠加在任何主行为状态的视觉表现上。
6. **新增优先级模型**: 定义了事件冲突时的处理优先级。
7. **新增 PetContext**: 定义了需要持久化到 SQLite 的宠物上下文字段。
8. **新增素材目录结构**: 按状态语义组织 sprite 素材，便于 Gemini 前端开发和未来扩展。
9. **新增程序退出流程**（第5章 5.3 节）。
10. **待决事项第 4 项已完成**: Tauri 技术验证通过。


**从 v0.3 升级到 v0.3.1 的主要变更**:
1. **动画素材初步处理完成**：进入归一化阶段
2. **新增动画帧功能文档**: `ani_resources.md`
3. **新增动画帧效果验证**：见本文`9.2节 进行中`部分- 备注：当时状态
4. **项目进入“动画资源验收 + 验证网页联调”阶段**


**从V0.3.1 升级到V0.3.2的主要变更**：
1. **重构了本文档组织结构**：统一了文档内部内容组织规范
2. **基本完成动画链条验证**：将初始动画验证脚本统一命名，并统一管理至`validation/Val_Stage1_roundx`文件夹内，x分别为A, B, C
3. **修改本文档命名方式**：将版本号集成在文档内部，文档更名`ichan_project_doc`，文件名与文档名保持一致。
4. **新增验证脚本集合**：见`3.3节 目录结构规划`部分
5. **新增动画验收报告**:详见`docs/val_reports.md`文档

**从 v0.3.2 升级到 v0.4 的主要变更**：
1. **新增软/硬打断分级**：将原先线性优先级解释收束为“软打断 / 硬打断”两级，并同步到 `4.4.4 状态优先级（冲突解决）`
2. **新增摸头反应表**：明确不同上下文中的摸头响应，包括 `idle.awake`、`idle.drowsy`、`idle.napping`、`eating`、`reminding`、`roaming`、`talking` 等情形
3. **idle.drowsy 方案升级为三段式**：统一为“进入段 / 单帧驻留循环 / 短退出段”口径，并在任务板中为 RbC4 增加按 v0.4 规则返工项
4. **新增位移类行为通用契约**：将 `targeted_move` 一类目标位移动作抽象为统一生命周期：触发、执行、到达判定、后续动作、途中中断
5. **新增 Phase 2 穿越窗口待决事项口径**：保留“穿越窗口跑向鼠标的活感行为”为 Phase 2 待评估事项，不进入当前 MVP 状态机实现范围

**从 v0.4.0 升级到 v0.4.5 的主要变更**：
1. **新增 4.5 节：播放器与状态机接口契约**：定义 AnimationPlayer 和 StateMachine 两个核心模块的对外接口骨架、5 条设计总则、对接契约示例，作为 Phase A 任务 2/3 并行开发的架构依据
2. **明确"单向依赖 / 语义分层 / token 代际 / CSS 独立 / 运动解耦"五条架构原则**
3. **文档命名变换**：项目文档名由`桌面宠物项目手册`更名为`桌面助手项目手册`

**从 v0.4.5 升级到 v0.4.6 的主要变更**：
1. **4.5 节外置为独立接口文档引用**：`播放器与状态机接口契约（Phase A）` 改为引用 `docs/interface_v1.1.md`，接口规范统一在独立文档维护
2. **补齐运动层“实际位移”实现**：在主应用接入窗口位移执行器，`roaming` 与 `targeted_move` 从“仅动画切换”升级为“动画+窗口位移”。
3. **补齐 targeted_move 到达闭环**：位移到达后自动派发 `movement.arrive`，并与状态机现有 `requestId` 防陈旧校验闭环对齐。

**从 v0.4.6 升级到 v0.4.7 的主要变更**：
1. **补录 PhaseA.5 落地项**：纳入 `readme_devpanel.md`、`phasea_5_optirepo.md` 与 DevPanel 相关文件路径，3.3 目录结构同步为当前事实。
2. **补充参数收口出口**：在目录结构中补充 `src/config/petBehaviorConfig.ts`，用于行为参数冻结与体验基线管理（非 Phase B 业务逻辑）。
3. **稳定 hungry 语义口径**：明确 hungry 为 `flags.isHungry` 对应 overlay/flag，不属于 `MajorState`；表现层走独立 hungry overlay，CSS effect 当前仅保留 `drowsy-breath`。
4. **阶段状态更新**：明确 Phase A 完成、PhaseA.5 体验冻结完成，项目进入 Phase B 业务能力接入阶段。
5. **统一 drowsy_exit 文案**：本手册内统一为“4 个源状态帧 + 目标态首帧自然衔接”，避免“5 帧均为 drowsy 自有帧”的歧义。

**从 v0.4.7 升级到 v0.4.8 的主要变更**：
1. **接口事实源升级**：4.5 节与文档矩阵统一改挂 `docs/interface_v1_2.md`。
2. **hungry 入口口径统一**：按接口裁定改为事件单入口 `dispatch({ type: 'hungry.set', value })`，不承认 `setHungry(...)` 为公共接口。
3. **drowsy_exit 表述再收口**：统一为“4 源帧 + 目标态首帧自然衔接”。



