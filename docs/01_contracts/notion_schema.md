# Notion Schema

> 版本：v1.0 - 2026-04-27（审计修订补建）  
> 真值源代码：`src/services/notion-service.ts`、`src/types/notion-types.ts`

## 1. 文档定位

本文件记录当前项目的 Notion 字段映射与服务契约真值，不包含任何敏感凭据示例。

## 2. 本地配置键（SQLite `config`）

- `notionToken`
- `todoDbId`
- `researchDbId`

说明：token/DB ID 仅保存在本地配置，不应写入仓库文档、脚本默认值或日志明文。

## 3. Todo DB 字段映射

对应 `TODO_DB_PROPERTY`：

- `每日待办`（title）
- `完成状态`（status）
- `日期`（date）
- `提醒时间`（date）
- `睡眠评分`（number）
- `分类`（select/multi_select）
- `优先级`（select）

## 4. Research DB 字段映射

对应 `RESEARCH_DB_PROPERTY`：

- `论文标题`（title）
- `发表年份`（number）
- `作者（仅一作）`（rich_text）
- `期刊/会议级别`（select/status）
- `阅读状态`（select/status）
- `研究领域`（multi_select）
- `优先级`（select/status）

## 5. Notion Service 契约

`NotionServicePort`：

- `getYesterdayTodos(databaseId)`
- `getLatestResearchLog(databaseId)`
- `createDailyPlan(databaseId, plan)`
- `getTodayTimedTodos(databaseId)`

`NotionServiceError.code`：

- `auth_failed`
- `rate_limited`
- `db_not_found`
- `network`
- `unknown`

## 6. 运行时行为要点

- Notion API Version 固定为：`2022-06-28`
- 429 指数退避：最多 3 次
- `getYesterdayTodos` 通过读取 page children 的 `to_do` block 构建结果
- `createDailyPlan` 先创建页面，再追加 `to_do` blocks

## 7. 审计对齐说明（2026-04-27）

- 修复“文档引用存在但文件缺失”问题（`docs_index.md`、`ichan_project_doc.md`、`phaseb_execution_plan.md`）。
- 明确敏感凭据不进入文档与仓库。
