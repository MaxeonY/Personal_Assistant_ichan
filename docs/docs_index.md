# docs_index

> **版本**: v2.1 - 2026-04-30（同步 B2-6 文档携带口径）  
> 目的：统一回答"去哪找什么"，并给出 Phase B 任务的最小文档携带口径。

---

## 1. 当前 docs 目录树

```text
docs/
├── docs_index.md                                # 本文件：文档索引与携带矩阵
├── ichan_project_doc.md                         # 项目总纲 / 唯一总入口
├── readme_devpanel.md                           # DEV 面板使用说明
├── param_audit.md                               # 全仓库参数汇总（调参入口）
│
├── 01_contracts/                                # 真值源（实现契约）
│   ├── interface_v1_2.md                        # 状态机 / 播放器接口契约
│   ├── ani_resources.md                         # 动画资源真值源（帧名、帧序、播放语义）
│   ├── behavior_config.md                       # 行为参数与体验基线
│   ├── persona_prompt_spec.md                   # i酱人格 Prompt 与 LLM 约束
│   ├── notion_schema.md                         # Notion 数据库字段映射
│   └── phaseb_valstrategyrepo.md                # Phase B 验证策略说明
│
├── 02_ui_schema/                                # UI Schema（布局、视觉、动效规范）
│   ├── first_run_wizard_schema.md               # 首启向导 UI Schema
│   ├── talking_interaction_schema.md            # 对话静态 UI Schema（气泡/输入区/交互规则）
│   └── dialog_transition_schema.md              # 对话窗口展开/收束动效真值源
│
├── 03_execution/                                # 执行计划
│   └── phaseb_execution_plan.md                 # Phase B 执行计划、Batch 划分、实施报告
│
├── 04_task_cards/                               # 任务卡
│   ├── active/                                  # 当前进行中的任务卡
│   │   └── B2-6_task_card_v1.2.md               # 待办提醒功能（进行中）
│   ├── done/                                    # 已完成任务卡
│   │   └── B1-7_task_card_v1.1.md               # 首启向导任务卡（已完成）
│   └── templates/                               # 任务卡模板
│
├── 05_audit/                                    # 审计基线
│   └── project_audit_report_2026-04-27.md       # 最新审计报告（唯一当前基线）
│
├── 06_fix_reports/                              # 修复报告归档
│   └── fix_summary_first_run_wizard.md          # B1-7 修复报告（结论已回流）
│
└── 99_archive/                                  # 历史归档
    ├── PhaseA/                                  # Phase A / Phase A.5 历史档案
    │   ├── engineering_lessons_phasea.md
    │   ├── phasea_5_optirepo.md
    │   ├── phasea_task2_devrepo.md
    │   ├── phasea_task3_devrepo.md
    │   ├── phasea_valrepo.md
    │   └── val_reports.md
    └── PhaseB/                                  # Phase B 早期档案（已过期）
        └── progress_audit_2026-04-24.md
```

---

## 2. 文档分层说明

| 层级 | 目录 | 定位 | 维护规则 |
|------|------|------|---------|
| **总纲** | `docs/` 顶层 | 项目唯一总入口，全局视角 | 跨模块结论回流目标；非真值源细节不进入 |
| **参数审计** | `docs/` 顶层（`param_audit.md`） | 全仓库参数汇总表，调参入口 | 随代码变更更新；不替代真值源，是真值源的聚合引用 |
| **真值源** | `01_contracts/` | 实现契约、数据映射、行为参数、Prompt 规格 | 单点维护：接口改动只落 `interface_v1_2.md`，动画口径只落 `ani_resources.md`，长期参数只落 `behavior_config.md`，Prompt 只落 `persona_prompt_spec.md` |
| **UI Schema** | `02_ui_schema/` | 视觉规范、布局 Token、动效规则 | 静态 UI 与动效分离维护：对话静态 UI 不混入窗口动效 |
| **执行计划** | `03_execution/` | Batch 划分、实施报告、进度追踪 | 每完成一个 Batch 子任务后更新对应实施日志 |
| **任务卡** | `04_task_cards/` | 单任务的输入/输出/依赖/验收标准 | 自包含、生命周期管理（见 §5） |
| **审计** | `05_audit/` | 文档 vs 代码交叉核查报告 | 保留最新的一份作为当前基线，旧审计进 `99_archive/` |
| **修复报告** | `06_fix_reports/` | 问题修复的详细记录 | 长期结论先回流到对应真值源/Schema，再归档修复报告 |
| **归档** | `99_archive/` | 历史过程文档、过期审计、旧报告 | 只归档不删除；不应作为日常任务默认上下文 |

---

## 3. 携带矩阵

> **默认集** = `ichan_project_doc.md` + `03_execution/phaseb_execution_plan.md`

| 任务场景 | 默认携带 | 按需补带 |
|----------|---------|---------|
| 日常 Phase B 任务（业务接入、常规调试） | 默认集 | 视任务补 `01_contracts/*` |
| 状态机 / 事件 / 播放器契约 | 默认集 | `01_contracts/interface_v1_2.md` |
| 动画资源 / 帧序 / spritesheet | 默认集 | `01_contracts/ani_resources.md` |
| 行为参数 / 调参 | 默认集 | `01_contracts/behavior_config.md` |
| 全仓库参数查表 / 交叉引用 | 默认集 | `param_audit.md` |
| DeepSeek / Prompt / 人格 | 默认集 | `01_contracts/persona_prompt_spec.md` |
| Notion 字段映射 / API | 默认集 | `01_contracts/notion_schema.md` |
| 验证策略 / harness | 默认集 | `01_contracts/phaseb_valstrategyrepo.md` |
| 首启向导 UI | 默认集 | `02_ui_schema/first_run_wizard_schema.md` |
| 对话静态 UI / 气泡 / 输入区 / 交互规则 | 默认集 | `02_ui_schema/talking_interaction_schema.md` |
| 待办提醒 / ReminderBubble | 默认集 | `01_contracts/behavior_config.md` + `readme_devpanel.md` |
| 对话打开/关闭动效 / anchor / phase / transition | 默认集 | `02_ui_schema/dialog_transition_schema.md` |
| DEV 面板观测/注入 | `ichan_project_doc.md` + `readme_devpanel.md` | 触及契约时加 `01_contracts/interface_v1_2.md` |
| 历史追溯 | 默认集 | `04_task_cards/done/*` 或 `99_archive/*` |

---

## 4. 真值源单点维护规则

1. **接口改动**：只修改 `01_contracts/interface_v1_2.md`，总纲 §4.5 引用该文件
2. **动画口径**：只修改 `01_contracts/ani_resources.md`，总纲动画章节引用该文件
3. **长期参数**：只修改 `01_contracts/behavior_config.md`，代码 `petBehaviorConfig.ts` 作为运行时真值
4. **Prompt 约束**：只修改 `01_contracts/persona_prompt_spec.md`，代码 `DeepSeekService.ts` 对齐该文件
5. **Notion 字段映射**：只修改 `01_contracts/notion_schema.md`，代码 `notion-service.ts` 对齐该文件
6. **对话静态 UI**：只修改 `02_ui_schema/talking_interaction_schema.md`
7. **对话动效**：只修改 `02_ui_schema/dialog_transition_schema.md`

> 任何跨模块结论必须**先回流到对应真值源**，再在总纲中添加摘要引用，不得只在总纲或执行计划中散落。
> `param_audit.md` 是参数聚合引用文档（派生汇总），不替代 `01_contracts/behavior_config.md` 等真值源。参数值变更仍应以真值源为准。

---

## 5. 任务卡生命周期

```
templates/ ──创建──▶ active/ ──完成──▶ done/
```

### 5.1 模板 (`04_task_cards/templates/`)
- 存放任务卡模板文件，新任务从此复制

### 5.2 进行中 (`04_task_cards/active/`)
- 当前正在实施的任务卡
- 一个任务卡对应一个文件，完成后移动到 `done/`

### 5.3 已完成 (`04_task_cards/done/`)
- 已完成并通过验收的任务卡
- 文件名标注完成版本号（如 `v1.1`）
- 长期结论已回流到真值源/Schema 后方可移入

---

## 6. 归档规则

### 6.1 归档条件
以下类型的文件应进入 `99_archive/`：
- 以"阶段过程记录"为主的文档（开发日志、验证轮次记录、阶段复盘报告）
- 按时间线叙述、包含大量已完成阶段的中间决策
- 已被更新的旧审计报告（保留最新的在 `05_audit/`）
- 已完成任务的修复报告（结论已回流到真值源/Schema 后方可归档到 `06_fix_reports/`）

### 6.2 不归档
以下文件不属于归档范围，保持活跃：
- `01_contracts/*`：真值源，始终当前
- `02_ui_schema/*`：Schema，始终当前
- `03_execution/phaseb_execution_plan.md`：执行计划，持续更新
- `04_task_cards/done/*`：任务卡，作为决策历史保留
- `05_audit/`：保留最新一份，旧审计进归档
- `readme_devpanel.md`：有效辅助文档
- `param_audit.md`：参数汇总，随代码变更更新

### 6.3 回流优先原则
- 参数冻结与调参边界 → 回流到 `01_contracts/behavior_config.md`
- 接口/动画/行为/Notion/Prompt 变更 → 回流到对应 `01_contracts/*`
- CSS/视觉落地修正 → 回流到 `02_ui_schema/*`
- 之后才执行物理归档

---

## 7. 新文档命名规则

| 文档类型 | 命名格式 | 示例 |
|----------|---------|------|
| 真值源 | `<主题>_<版本>.md` 或 `<主题>.md` | `interface_v1_2.md` |
| UI Schema | `<主题>_schema.md` | `dialog_transition_schema.md` |
| 执行计划 | `<阶段>_execution_plan.md` | `phaseb_execution_plan.md` |
| 任务卡 | `B<batch>-<编号>_task_card_v<版本>.md` | `B1-7_task_card_v1.1.md` |
| 审计报告 | `project_audit_report_<YYYY-MM-DD>.md` | `project_audit_report_2026-04-27.md` |
| 修复报告 | `fix_summary_<主题>.md` | `fix_summary_first_run_wizard.md` |
| 参数审计 | `param_audit.md` | `param_audit.md` |
| 归档文档 | 保留原始文件名 | `engineering_lessons_phasea.md` |

---

## 8. 快速决策流程（1 分钟内判断带哪些文档）

1. 先带总纲：`ichan_project_doc.md`
2. 带执行计划：`03_execution/phaseb_execution_plan.md`
3. 判断任务主轴：
   - 触及接口契约 → 补 `01_contracts/interface_v1_2.md`
   - 触及动画帧序 → 补 `01_contracts/ani_resources.md`
    - 触及调参/行为 → 补 `01_contracts/behavior_config.md`
    - 跨模块参数查表/审计 → 补 `param_audit.md`
   - 触及 LLM Prompt → 补 `01_contracts/persona_prompt_spec.md`
   - 触及 Notion → 补 `01_contracts/notion_schema.md`
   - 触及验证 → 补 `01_contracts/phaseb_valstrategyrepo.md`
   - 触及首启 → 补 `02_ui_schema/first_run_wizard_schema.md`
   - 触及对话 UI → 补 `02_ui_schema/talking_interaction_schema.md`
   - 触及对话动效 → 补 `02_ui_schema/dialog_transition_schema.md`
   - 涉及 DEV 面板 → 补 `readme_devpanel.md`
4. 需历史追溯时 → 补 `04_task_cards/done/*` 或 `99_archive/*`

---

## 9. Batch 2 文档同步（2026-04-30）

- 本轮进行中任务卡：`active/B2-6_task_card_v1.2.md`
- 已完成归档任务卡：`done/B2-9_task_card_v1.2.md`
- 相关回流文档：
  - `01_contracts/behavior_config.md`（v1.4）
  - `03_execution/phaseb_execution_plan.md`（新增 5.14）
  - `readme_devpanel.md`（v1.3）
  - `param_audit.md`
  - `ichan_project_doc.md`
  - `docs_index.md`
  - `01_contracts/interface_v1_2.md`（v1.3）
  - `02_ui_schema/talking_interaction_schema.md`
