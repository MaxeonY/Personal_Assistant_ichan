# B1-7 任务卡 · 首次启动配置向导（FirstRunWizard）

**版本**: v1.1（审计+落地对齐修订；任务已完成实施与验收，实施报告见 `phaseb_execution_plan.md` §5.6）
**日期**: 2026-04-25（草案） → 2026-04-27（定稿）
**起草**: Claude
**执行批次**: Batch 1
**对应任务**: 任务 7（首次启动配置向导）
**依赖**: B0-3（config 表 + `config_get_value`/`config_set_value` 命令已落地）

---

## 0. 任务定位

首次启动 i酱 时，弹出配置向导收集 4 个必填项写入本地 SQLite，避免每次启动都让用户重输 Notion token / DB ID / DeepSeek API Key。本卡只覆盖**首次配置**；运行后再次修改配置走另外的入口（见 §10）。

---

## 1. 范围

### 1.1 范围内
- 启动时检查"是否已完成首次配置"，未完成则拦截 pet 启动并展示向导。
- 4 项必填配置：`notionToken` / `todoDbId` / `researchDbId` / `deepseekApiKey`。
- 字段实时格式校验 + 提交前真网联通性测试。
- 写入 SQLite 配置表，复用 B0-3 的 `config_get_value` / `config_set_value` 命令。
- 标记 `setup_completed = '1'` + 写入 `configVersion`，作为下次启动的判定依据。
- 配置完成后向 pet 主窗口让渡，启动正常流程。

### 1.2 范围外
- 不实现"已配置后修改配置"的设置面板（独立任务，建议归到 Task 10 的扩展或单独 B1-7.5）。
- 不做 token 加密落盘（沿用 B0-3 现状的明文 SQLite；威胁模型见 §3）。
- 不实现自动迁移逻辑（`configVersion` 仅记录，迁移在未来需要时单独排）。
- 不引入新的状态机事件（向导属于 `start(...)` 前置 gating）。

---

## 2. 开放设计决策（待项目负责人定）

下面 5 项要先拍板，再具体落实。

### 2.1 向导渲染方式（核心决策）
| 方案 | 描述 | 优 | 劣 |
|---|---|---|---|
| **A. 独立 Tauri 窗口** | 新建一个 wizard window，配置完关闭，再启动 pet window | 表单 UX 自然 / 与 pet 解耦 / Tauri multi-window 是支持的 | 需要新增 window config + 一套独立 React 入口 |
| **B. 复用 pet window 扩展** | 同 Task 10 的 interactive_box 思路：pet window `set_size` 扩大成 wizard 面板 | 视觉语言统一 / 无新窗口 | 时序耦合（wizard 期间 pet 动画必须暂停） / 形态尺寸约束更严 |
| **C. 系统对话框** | 用 Tauri `dialog` API 串 4 个 input | 实现最简 | UX 极差（无回退、无校验反馈、无格式提示），不推荐 |

**Claude 倾向**：A。理由——首次配置是一次性高密度交互，跟 pet 的日常待命形态目标不一样；解耦之后窗口尺寸/位置/装饰栏都可以专门配。B 在 Task 10 之前做反而要先趟一遍多窗口的坑没必要。C 仅作为兜底。

  - 审阅意见：见项目内`ichanDesign/FirstRunWizard/UI_Design_Draft.png`

### 2.2 字段校验时机
- **方案 X：边输边验**：每个字段失焦时跑一次轻量 API ping，红/绿即时反馈。
- **方案 Y：仅提交时验**：填完点"测试连接"统一校验，全通过才允许保存。

**Claude 倾向**：Y。理由——X 体验更好但实现成本高（每个字段一个独立 loading 态），且用户填到一半频繁触发 API 调用浪费配额；Y 一次性集中验证，加一个明确的"测试连接"按钮就够了。
  - 审阅意见：Approved

### 2.3 token 落盘是否加密
- **方案 P：明文 SQLite**：与 B0-3 一致，依赖文件系统权限保护。
- **方案 Q：Tauri keyring + SQLite 索引**：token 走系统 keyring，SQLite 只存 keyring 引用键。

**Claude 倾向**：P。理由——单用户桌面应用，本地 SQLite 文件已经在 OS 用户隔离下；引入 keyring 跨 Win/macOS/Linux 行为不一致，调试成本陡增。可在 §11 待办里挂一条"未来威胁模型升级时改 Q"。
  - 审阅意见：Approved

### 2.4 DB ID 输入便利
Notion DB ID 是 32 位 hex（带或不带连字符），也可以从 DB 页面 URL 提取。
- **方案 M：仅接受纯 ID**：用户自己处理。
- **方案 N：接受 URL 或 ID**：粘贴 URL 时自动提取最后一段。


**Claude 倾向**：N。理由——绝大多数用户从 Notion 复制的就是 URL，让用户自己 split 一次很无理由。提取规则简单（正则 `[0-9a-f]{32}` 或 dashed UUID）。
  - 审阅意见：Approved

### 2.5 失败重试策略
连接测试失败时：
- **方案 R：阻塞保存**：必须 4 项全通过才允许 finish。
- **方案 S：警告后允许保存**：用户可以"我知道，先保存"，向导过去后由各 service 在使用时报错。

**Claude 倾向**：R。理由——这 4 项中任何一项错都会让对应功能直接不可用（晨间仪式 / DeepSeek 调用 / Notion 读写）；与其让用户后续遇到玄学错误，不如在向导里就拦下来。但要给一个明确"跳过此字段，稍后再配"的逃生口（写空值 + 标记 `setup_partial = '1'`），不让用户被卡死。
  - 审阅意见：Approved

---

## 3. 安全 / 隐私边界（项目级约定）

- token 明文存于 `${app_data_dir}/app.sqlite`，依赖 OS 用户文件权限隔离。
- 不在日志、不在 trace、不在错误信息里打印 token 全文（仅打印末 4 位）。
- 校验失败的 API 响应体可以打印（用于排错），但响应里如果回带了 token 必须脱敏。
- 卸载/清除数据通过删除 `app.sqlite` 完成；不提供 in-app "清除所有 token" 按钮（避免误操作）。

---

## 4. 数据契约

### 4.1 SQLite 写入
复用 B0-3 的 `config(key TEXT PRIMARY KEY, value TEXT)`，新增 5 行 key：

| key | value 示例 | 说明 |
|---|---|---|
| `notionToken` | `secret_xxx...` | Notion integration token |
| `todoDbId` | `1a2b3c...`（32 hex，去连字符） | Todo / DailyPlan DB |
| `researchDbId` | `9e8d7c...` | Research DB |
| `deepseekApiKey` | `sk-xxx...` | DeepSeek API key |
| `setup_completed` | `1` 或 `0` | 首次配置完成标志 |
| `configVersion` | `1.0` | 当前 config schema 版本 |

（前 4 个已有；后 2 个新增。）

### 4.2 接口契约

```ts
// src/services/FirstRunWizardService.ts

export interface SetupStatus {
  completed: boolean;
  configVersion: string | null;
  missingKeys: Array<'notionToken' | 'todoDbId' | 'researchDbId' | 'deepseekApiKey'>;
}

export interface ValidationResult {
  field: 'notionToken' | 'todoDbId' | 'researchDbId' | 'deepseekApiKey';
  ok: boolean;
  error?: 'auth_failed' | 'not_found' | 'network' | 'invalid_format' | 'unknown';
  detail?: string; // 给用户看的简短中文说明
}

export interface FirstRunWizardService {
  /** 启动时调用：判断是否需要拉起向导 */
  checkSetupStatus(): Promise<SetupStatus>;

  /** "测试连接"按钮触发：批量校验 4 个字段 */
  validateAll(input: {
    notionToken: string;
    todoDbId: string;
    researchDbId: string;
    deepseekApiKey: string;
  }): Promise<ValidationResult[]>;

  /** "完成"按钮触发：写入 SQLite 并标记 setup_completed */
  saveAndComplete(input: {
    notionToken: string;
    todoDbId: string;
    researchDbId: string;
    deepseekApiKey: string;
  }): Promise<{ saved: true; configVersion: string }>;
}
```

### 4.3 校验实现细节
- `notionToken`：调用 `GET https://api.notion.com/v1/users/me`，200 通过，401 → `auth_failed`。
- `todoDbId` / `researchDbId`：调用 `GET https://api.notion.com/v1/databases/{id}`，200 通过，404 → `not_found`，401 → `auth_failed`（前提是 token 已通过；token 没过的话本字段直接跳过校验）。
- `deepseekApiKey`：调用最小 chat completion（max_tokens=1, messages=[{role:'user',content:'.'}]），200 通过，401 → `auth_failed`，402 → `auth_failed` + detail "余额不足"。
- 所有校验都带 6s 超时，超时 → `network`。

---

## 5. 启动流程改造

应用入口（Tauri main / lib.rs 或前端 App.tsx）需要插入一段 gating：

```
应用启动
  └─ checkSetupStatus()
       ├─ completed === true → 直接 start pet
       └─ completed === false → 拉起向导
              ├─ 用户完成 → saveAndComplete() → start pet
              └─ 用户关窗 → 退出应用（不允许跳过）
```

具体由 §2.1 决策决定改造点：
- 方案 A：main.rs 启动时建 wizard window 而非 pet window；wizard window 完成后 emit 事件给主进程切到 pet window。
- 方案 B：前端 App.tsx 路由层 gating，wizard 用同窗口 React 组件。

---

## 6. UI 草案（方案 A 假设）

向导窗口尺寸：480×600，居中，无侧栏。
单页面 4 字段表单（不分步），结构：

```
┌─────────────────────────────────┐
│  i酱 · 第一次见面 ✨            │  ← 标题
│                                 │
│  在开始之前，我需要一些信息才能 │
│  帮你打理科研和健身。           │
│                                 │
│  Notion Integration Token       │
│  [_________________________]    │  password 框，末 4 位明文
│                                 │
│  Todo / Daily Plan 数据库       │
│  [_________________________]    │  接受 URL 或 ID
│  ↳ 在哪找到? (链接到帮助文档)   │
│                                 │
│  Research 数据库                │
│  [_________________________]    │
│                                 │
│  DeepSeek API Key               │
│  [_________________________]    │
│                                 │
│  [ 测试连接 ]   [ 完成 ]        │
│                                 │
│  ⓘ 校验状态显示区               │  4 行，绿✓ 红✗
└─────────────────────────────────┘
```

按钮态：
- 默认：[测试连接] enabled，[完成] disabled。
- 测试通过：[完成] enabled。
- 测试失败：[完成] disabled，状态区列出哪一项失败 + detail。

视觉：先做能用；像素风可以后续 Gemini 出 sprite 时再叠（小幽灵从屏幕角落探头）。**第一版不要在视觉上死磕**，能跑能验证为先。

---

## 7. 改动清单（方案 A 基线）

### 新增
| 文件 | 说明 |
|---|---|
| `src/services/FirstRunWizardService.ts` | 三个方法实现，复用 B0-3 / B0-4 服务做联通性测试 |
| `src/types/wizard-types.ts` | SetupStatus / ValidationResult |
| `src/wizard/WizardApp.tsx` | wizard window 的 React 入口 |
| `src/wizard/WizardForm.tsx` | 表单组件 |
| `src/wizard/index.html` | wizard window 的 HTML 入口 |
| `src-tauri/src/wizard/mod.rs` | （可选）window 切换逻辑 |

### 修改
| 文件 | 说明 |
|---|---|
| `src-tauri/tauri.conf.json` | 新增 wizard window config |
| `src-tauri/src/lib.rs` | 启动时根据 setup_completed 决定开哪个 window |
| `src/App.tsx`（pet 主入口） | 假设 setup 已完成；不再处理向导逻辑 |

### 不动
- `src-tauri/permissions/config/default.toml`（已有 allow-config-* 足够）
- B0-3 / B0-4 服务（仅被复用，不修改）

---

## 8. 测试用例

### 8.1 单元（service 层）
| ID | 输入 | 期望 |
|---|---|---|
| U1 | config 表为空 | checkSetupStatus().completed === false，missingKeys = 4 项全部 |
| U2 | 仅 setup_completed=1，其他键有值 | completed === true |
| U3 | setup_completed=1，但 notionToken 缺失 | completed === true（信任 setup 标志，由 service 层运行时报错） |
| U4 | validateAll 全合法 | 4 项 ValidationResult.ok 均为 true |
| U5 | validateAll 中 notionToken 错 | 第一项 ok=false, error='auth_failed'；后两项 Notion 校验跳过（依赖未通过） |
| U6 | validateAll 网络断开 | 全部 error='network' |
| U7 | saveAndComplete 成功 | 6 个 key 都写入；setup_completed='1'；configVersion='1.0' |

### 8.2 集成（流程层）
| ID | 场景 | 期望 |
|---|---|---|
| I1 | 全新安装首次启动 | 仅 wizard window 出现，pet 不启动 |
| I2 | 完成 wizard | wizard 关闭 / pet window 出现 / 配置可被 B0-3 / B0-4 读到 |
| I3 | 第二次启动 | 直接 pet window，无 wizard |
| I4 | 用户中途关闭 wizard 窗口 | 应用退出，下次启动仍走 wizard（不残留半 setup） |
| I5 | DB 文件被手动删除 | 第三次启动重新走 wizard |

### 8.3 安全
| ID | 场景 | 期望 |
|---|---|---|
| S1 | 验证失败的日志 | token 全文不出现，仅末 4 位 |
| S2 | trace 日志（DEV） | token 字段被替换成 `sk-***1234` 类格式 |

---

## 9. 验收方法（项目负责人）

1. 删除 `app.sqlite`，启动应用 → 确认 wizard 弹出。
2. 输入故意错误的 token 点测试 → 确认对应字段标红 + detail 文案准确。
3. 全部正确填写 → 测试通过 → 完成 → 应用切到 pet 主形态。
4. 退出 → 重启 → 直接进 pet，无 wizard。
5. 用 SQLite 浏览器打开 app.sqlite，核对 6 个 config 行存在且值符合预期。
6. 检查 DEV trace 日志，确认 token 全部脱敏。

---

## 10. 推迟事项 / 后续任务

- **B1-7.5（建议拆）**：运行后修改配置的入口。可考虑：
  - 系统托盘菜单 → "重新配置"
  - pet 右键菜单 → "设置"
  - 直接复用 wizard window，预填当前值，跳过启动 gating
- **未来威胁模型升级**：明文 token 改为 Tauri keyring 存储（§2.3 方案 Q）。
- **多账户支持**：当前假设单 Notion workspace + 单 DeepSeek 账号。
  - 审阅意见：仅个人使用，无多账户、多API

---

## 11. 可拆分子任务（执行者灵活分配）

如果这张卡太大不好一次吞，可以按下面的边界拆给不同执行者：

| 子任务 | 范围 | 适合谁 |
|---|---|---|
| **B1-7a Service 层** | §4 接口契约 + checkSetupStatus / validateAll / saveAndComplete 实现，单测 U1-U7 | Codex（IDE 内编辑 + 跑单测的强项） |
| **B1-7b 启动流程改造** | §5 + Tauri window 切换 + lib.rs gating | Codex 或 Grok（Rust 侧改动） |
| **B1-7c Wizard UI** | §6 React 组件 + 表单交互 + 状态机（idle / testing / pass / fail） | Gemini（前端动画/UI） 或 GPT |
| **B1-7d 集成测试与验收** | §8.2 / §9 | 项目负责人 + Codex 联调 |

不拆也行——单人吃一张卡是 Codex 的擅长姿势（B0-1 / B0-3 / B1-4 都是这么干的），可控性更高。

---

## 12. 待项目负责人确认事项

依次给出意见：

1. §2.1 渲染方式 → A / B / C？
  - 审阅意见：A类拓展，见""
2. §2.2 校验时机 → X / Y？
3. §2.3 token 加密 → P / Q？
4. §2.4 DB ID 输入 → M / N？
5. §2.5 失败处理 → R / S？
6. §11 子任务拆分 → 整张卡一人吃（谁？）/ 还是按 a/b/c/d 拆？
  - 审阅意见：单 Agent 处理，审阅分开
7. §6 第一版视觉 → 接受"先能用，像素风后补"还是要 Gemini 同步介入设计 sprite？
  - 审阅意见：见附件图片

---

*v0.1 草稿。决策意见请直接对号回写或行级反馈。确认后落 v1.0 进 `docs/B1-7_task_card.md`，再进入实施。*


## 13. 审计对齐补充（2026-04-27）
- 本任务卡已从“执行草案”转为“落地回溯参考”，最终实施真值以 `docs/phaseb_execution_plan.md` §5.6 为准。
- 代码路径以 `src/wizard/` 与 `src/services/FirstRunWizardService.ts` 为准。

