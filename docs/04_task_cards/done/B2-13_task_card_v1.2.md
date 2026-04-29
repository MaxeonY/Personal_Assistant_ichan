# B2-13 任务卡 · chat 历史 FTS5 关键词记忆库

**版本**: v1.2（Codex 可执行版，吸收 Claude P1/P2 裁定 + GPT 审定修订）  
**日期**: 2026-04-29  
**执行**: Codex  
**对应任务**: B2-13 / 任务 13（chat 历史 FTS5 关键词记忆库）  
**依赖**: B0-11（chat_messages 表）✅、B1-4（ChatContextBuilder 阶段 1）✅、B0-8（persona_prompt_spec v1.0）✅  
**对标基准**: B1-12_task_card_v1.3.md

---

## 行号引用约定

本卡引用的所有行号均为**参考定位**，基于 B2-13 起草时的代码快照。Codex 必须先用 `rg -n "<关键字>"` 确认实际位置后再编辑。行号偏差不视为任务卡错误。

---

## 0. 任务定位

本卡把 B1-4 已落地的 `ChatContextBuilder` 阶段 1（仅 recentWindow）升级为阶段 2：

```text
system prompt
+ 可选「以下是相关历史」召回段
+ 当前会话 recentWindow
+ 本次 user message
```

实现方式：在现有 SQLite 库中新增 FTS5 虚表 `chat_memory_index`，Rust 侧用 `jieba-rs` 分词并写入索引，查询时用 FTS5 BM25 召回跨会话历史片段。

---

## 1. 已决议项与硬约束

### 1.1 Claude 已固化裁定，本卡直接执行

1. **SQL 注入面必须修正**  
   `MATCH` 表达式必须通过 SQLite 参数绑定传入，禁止用 `format!` 把 `match_expr` 拼进 SQL 字符串。FTS5 支持参数化 `MATCH ?1`，性能等价。

2. **FTS5 模式术语修正**  
   本卡使用 FTS5 默认 self-managed content 模式：未指定 `content=''`，FTS5 自管理 content 副本。不得称为 content-less 模式。

3. **删除 `prefix = '0'`**  
   FTS5 `prefix` 参数必须是正整数列表；本卡不做前缀索引，直接省略 `prefix`。

4. **实现质量建议**  
   `tokenize_for_index` / `tokenize_for_query` 可抽共享 helper；`STOPWORDS.contains(t)` 如遇借用类型问题按 rustc 提示调整；TS `buildPromise` 状态管理以可读、可测为准。

### 1.2 架构边界

- 不修改 `chat_messages` 表结构。
- 不修改 `MajorState` / `PetEvent` / `StateMachine` public API。
- 不修改 `ChatHistoryStore.append/listBySession/listRecent` 公共签名。
- 不引入 embedding / reranker / LLM 关键词提取。
- 不动 B1-10 对话 UI，不闭合 talking 退出；该事项仍归 B2-9。
- 允许修改 `ChatContextBuilder` 内部行为与构造签名，允许补传 `sessionId`。
- 允许新增 Rust 命令：`chat_memory_build_index`、`chat_memory_query`。

### 1.3 参数冻结值

| 参数 | 冻结值 | 建议位置 | 说明 |
|---|---:|---|---|
| `RECENT_TURNS_DEFAULT` | `6` | `src/services/ChatContextBuilder.ts` | 最近 6 轮，即最多 12 条消息 |
| `RECALL_TOP_K_DEFAULT` | `3` | `src/services/ChatContextBuilder.ts` | FTS5 召回条数 |
| `RECALL_TIME_WINDOW_DAYS` | `90` | `src-tauri/src/chat/memory.rs` | 召回时间窗 |
| `MIN_TOKEN_LENGTH` | `2` | `src-tauri/src/chat/memory.rs` | 单字 token 不入索引 |
| `MAX_MATCH_TOKENS` | `5` | `src-tauri/src/chat/memory.rs` | 查询关键词上限 |
| `BUILD_INDEX_BATCH_SIZE` | `500` | `src-tauri/src/chat/memory.rs` | buildIndex 每批事务条数 |
| `CHAT_MEMORY_INDEX_VERSION` | `"1"` | `config` 表 | 索引 schema 版本 |

---

## 2. 接口契约

### 2.1 TS 侧接口

新增 `src/services/ChatMemoryStore.ts`：

```ts
import type { ChatMessageRecord } from "./chat-history-store";

export interface ChatMemoryQuery {
  currentUserMessage: string;
  recentTurns: number;
  recallTopK: number;
  excludeSessionId?: string;
  sessionId?: string;
}

export interface ChatMemoryResult {
  recalled: ChatMessageRecord[];     // BM25 相关度顺序
  recentWindow: ChatMessageRecord[]; // 时间正序
}

export interface ChatMemoryStore {
  buildIndex(): Promise<void>;
  query(input: ChatMemoryQuery): Promise<ChatMemoryResult>;
}
```

### 2.2 Rust 命令

| 命令 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `chat_memory_build_index` | `()` | `{ rebuilt: bool, indexed: u32 }` | 幂等；版本一致且索引健康时 no-op |
| `chat_memory_query` | `ChatMemoryQuery` | `ChatMemoryResult` | 返回 recalled + recentWindow |

`chat_append_message` 签名不变，但内部扩展为同事务写 `chat_messages` + `chat_memory_index`。

---

## 3. 数据流与边界条件

```text
chat_append_message(record)
  ├─ validate role / payload shape
  ├─ BEGIN transaction
  ├─ INSERT chat_messages
  ├─ if role in ('ichan', 'user'):
  │    ├─ tokens = tokenize_for_index_with_fallback(content)
  │    └─ INSERT chat_memory_index(message_id, session_id, role, created_at, tokens)
  ├─ if role == 'system': skip index
  └─ COMMIT

chat_memory_query(input)
  ├─ recentWindow:
  │    ├─ if input.sessionId exists: listBySession(sessionId, recentTurns * 2)
  │    └─ else: listRecent(recentTurns * 2)
  ├─ queryTokens = tokenize_for_query(currentUserMessage)
  ├─ if queryTokens empty: recalled = []
  ├─ else:
  │    ├─ matchExpr = build_match_expr(queryTokens)
  │    ├─ SQL MATCH ?1 parameter binding
  │    ├─ excludeSessionId filter if provided
  │    ├─ recentWindow ids NOT IN filter if non-empty
  │    ├─ created_at >= now - 90 days
  │    └─ ORDER BY bm25(chat_memory_index) ASC LIMIT recallTopK
  └─ return { recalled, recentWindow }
```

边界条件必须显式处理：

- `role === 'system'`：入 `chat_messages`，不入 FTS5 索引。
- `currentUserMessage` 分词后为空：不执行 FTS5 查询，`recalled=[]`。
- `recentWindow.ids` 为空：不要生成非法 `NOT IN ()`；跳过该条件。
- `excludeSessionId` 为空：不要生成 `idx.session_id != NULL`；跳过该条件。
- `recallTopK <= 0`：clamp 到 `0`，直接 `recalled=[]`。
- `recentTurns <= 0`：clamp 到 `0`，`recentWindow=[]`。

---

## 4. 实施步骤（按 commit 拆分，逐条执行）

---

### Commit 0 — `feat:` add chat memory FTS5 schema and Rust module

**目标**：新增 FTS5 虚表、Rust 模块、Cargo 依赖和命令注册骨架。

**前置检查**：

```bash
rg -n "CREATE TABLE.*chat_messages|chat_messages" src-tauri/src
rg -n "SCHEMA_SQL|config\s*\(" src-tauri/src
rg -n "generate_handler|invoke_handler|chat_append_message" src-tauri/src
rg -n "rusqlite|features.*bundled" src-tauri/Cargo.toml
```

**改动清单**：

1. `src-tauri/Cargo.toml` 新增：

```toml
jieba-rs = "0.7"
```

如当前 `rusqlite` 未启用 FTS5，改为保留既有 feature 的同时加入 `fts5`：

```toml
rusqlite = { version = "...", features = ["bundled", "fts5", ...] }
```

2. 新增 `src-tauri/src/chat/memory.rs`，至少包含常量、分词 helper、DDL 初始化、FTS5 可用性检测骨架。

3. 在 `chat/mod.rs` 或现有 chat 模块入口中暴露 `memory` 子模块。

4. 在 Tauri command 注册处加入：

```rust
chat_memory_build_index,
chat_memory_query,
```

**DDL 必须使用以下形态**：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chat_memory_index USING fts5(
    message_id UNINDEXED,
    session_id UNINDEXED,
    role UNINDEXED,
    created_at UNINDEXED,
    tokens,
    tokenize = 'unicode61 remove_diacritics 0'
);
```

**禁止项**：

```sql
-- 禁止：本卡不是 content-less 模式
content = ''

-- 禁止：prefix 不能为 0
prefix = '0'
```

**Commit 0 验收**：

```bash
cargo check
cargo test chat::memory -- --nocapture
pnpm exec tsc --noEmit
```

---

### Commit 1 — `feat:` index chat messages on append transaction

**目标**：扩展 `chat_append_message` 内部实现，实现 chat 主表与 FTS5 索引表同事务写入。

**前置检查**：

```bash
rg -n "chat_append_message" src-tauri/src
rg -n "INSERT INTO chat_messages" src-tauri/src
rg -n "role.*system|role.*ichan|role.*user" src-tauri/src
rg -n "BEGIN|transaction|unchecked_transaction" src-tauri/src
```

**改动清单**：

1. 找到 `chat_append_message` 的写库逻辑，把 `chat_messages` insert 和 `chat_memory_index` insert 放到同一个 SQLite transaction 内。

2. `role IN ('ichan', 'user')` 时写索引；`system` 不写索引。

3. 分词函数采用共享 helper，避免 index/query 双份逻辑漂移：

```rust
fn tokenize(text: &str, allow_fallback: bool) -> Vec<String>;
pub fn tokenize_for_index_with_fallback(text: &str) -> String;
pub fn tokenize_for_query(text: &str) -> Vec<String>;
```

4. `STOPWORDS.contains(...)` 如出现 `&&str` / `&str` 借用问题，按 rustc 提示调整，例如：

```rust
.filter(|t| !STOPWORDS.contains(t))
// 或
.filter(|t| !STOPWORDS.contains(&t.as_str()))
```

以实际类型为准。

**Commit 1 验收**：

```bash
cargo test append_message_writes_to_both_tables append_system_role_does_not_index
cargo check
```

---

### Commit 2 — `feat:` implement parameterized buildIndex and query

**目标**：实现 `chat_memory_build_index` 和 `chat_memory_query`，并修正 SQL 注入面。

**前置检查**：

```bash
rg -n "listBySession|list_recent|listRecent|SELECT .*chat_messages" src-tauri/src src
rg -n "bm25|MATCH|chat_memory_index" src-tauri/src
rg -n "created_at|createdAtIso|created_at_iso" src-tauri/src src
rg -n "chat_memory_index_version|config_get_value|config_set_value" src-tauri/src src
```

**MATCH 表达式生成**：

```rust
pub fn build_match_expr(query_tokens: &[String]) -> Option<String> {
    const MAX_MATCH_TOKENS: usize = 5;

    let escaped: Vec<String> = query_tokens
        .iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .take(MAX_MATCH_TOKENS)
        .map(|t| {
            let escaped_inner = t.replace('"', "\"\"");
            format!("\"{escaped_inner}\"")
        })
        .collect();

    if escaped.is_empty() {
        None
    } else {
        Some(escaped.join(" OR "))
    }
}
```

**SQL 安全硬约束**：

必须使用参数绑定。推荐形态：

```rust
let sql = r#"
SELECT m.id, m.session_id, m.role, m.content, m.created_at
FROM chat_messages m
JOIN chat_memory_index idx ON idx.message_id = m.id
WHERE chat_memory_index MATCH ?1
  AND (?2 IS NULL OR idx.session_id != ?2)
  AND idx.created_at >= ?3
ORDER BY bm25(chat_memory_index) ASC
LIMIT ?4
"#;

conn.prepare(sql)?.query_map(
    params![match_expr, exclude_session_id, min_created_at, recall_top_k],
    map_chat_message_record,
)?;
```

如需要 `NOT IN recentWindow.ids`，可动态生成占位符，但**只能动态生成占位符列表**，不得拼接用户文本：

```rust
// recent_ids = [12, 13, 14]
// append: AND m.id NOT IN (?5, ?6, ?7)
// bind ids via rusqlite params_from_iter / dynamic params
```

如果实现动态参数复杂，可采用两步法：SQL 先查 `LIMIT recallTopK + recentWindow.len()`，Rust 侧按 `recentWindowIds` 去重后截断到 `recallTopK`。该路径必须保留测试：`query_recalled_excludes_items_already_in_recent_window`。

**buildIndex 语义**：

- 版本一致且索引健康：返回 `{ rebuilt: false, indexed: 0 }`。
- 版本缺失 / 不等于 `"1"` / 索引缺失：清空并重建，写回 `config('chat_memory_index_version','1')`。
- 每 500 条为一个事务批次；不得把 UI 首屏阻塞在 buildIndex 上。

**Commit 2 验收**：

```bash
cargo test build_index_is_idempotent build_index_rebuilds_after_version_bump
cargo test query_recalled_excludes_current_session query_recalled_excludes_items_already_in_recent_window query_respects_time_window
cargo check
```

---

### Commit 3 — `feat:` add ChatMemoryStore and wire ChatContextBuilder phase 2

**目标**：前端服务封装 Rust 命令，并把 `ChatContextBuilder` 升级到阶段 2。

**前置检查**：

```bash
rg -n "class ChatContextBuilder|function getChatContext|getChatContext\(" src
rg -n "DeepSeekService.*chat|chat\(" src/services src/components
rg -n "activeSessionId|sessionId" src/components src/services src
rg -n "chat-history-store|ChatMessageRecord" src/services src/types
```

**改动清单**：

1. 新增 `src/services/ChatMemoryStore.ts`，封装：

```ts
buildIndex(): Promise<void>
query(input: ChatMemoryQuery): Promise<ChatMemoryResult>
```

2. `buildPromise` 规则：

```ts
private buildPromise: Promise<void> | null = null;
private hasRetriedBuild = false;
private fts5Disabled = false;
```

- 并发 build 复用同一个 promise。
- 成功后允许保留 resolved promise 或重置为 null，必须行为可预测。
- 失败后最多重试一次。
- FTS5 不可用时 `recalled=[]`，仍返回 recentWindow 降级结果。

3. `ChatContextBuilder.getChatContext(currentUserMessage, sessionId)`：

```ts
const memResult = await this.memoryStore.query({
  currentUserMessage,
  recentTurns: RECENT_TURNS_DEFAULT,
  recallTopK: RECALL_TOP_K_DEFAULT,
  sessionId,
  excludeSessionId: sessionId,
});
```

4. `formatRecalled()` 输出：

```text
以下是相关历史:
[YYYY-MM-DD HH:mm] 你: ...
[YYYY-MM-DD HH:mm] i酱: ...
```

规则：

- recalled 为空时不插入 system 消息。
- 每条 content 最多 150 字符，超长加 `…`。
- `ichan` → `i酱`，`user` → `你`。
- recentWindow 映射为 OpenAI messages 时：`ichan` → `assistant`，`user` → `user`，过滤 `system`。

5. 调用方补传 `sessionId`。优先使用 B1-10 已有 `activeSessionId`，不新增 UI 状态。

**Commit 3 验收**：

```bash
pnpm exec tsc --noEmit
pnpm test -- ChatContextBuilder ChatMemoryStore
```

若项目尚未配置测试脚本，先执行：

```bash
rg '"test"|"vitest"|"jest"' package.json
```

已有测试框架则沿用；没有则只补最小 Vitest 配置，不引入额外测试体系。

---

### Commit 4 — `test:` add Rust and TS coverage for memory recall

**目标**：补齐硬门槛测试和边界测试。

**前置检查**：

```bash
rg -n "\#\[cfg\(test\)\]|mod tests" src-tauri/src/chat src-tauri/src
rg -n "vitest|jest|describe\(" src package.json
rg -n "ChatContextBuilder|ChatMemoryStore" src
```

**Rust 必测 10 项**：

- `append_message_writes_to_both_tables`
- `append_system_role_does_not_index`
- `query_returns_recent_window_in_chronological_order`
- `query_recalled_excludes_current_session`
- `query_recalled_excludes_recent_window`
- `query_with_empty_keywords_returns_empty_recalled`
- `query_respects_time_window`
- `build_index_is_idempotent`
- `build_index_rebuilds_after_version_bump`
- `jieba_segmentation_filters_short_tokens_and_stopwords`

**Rust 补充 3 项**：

- `build_match_expr_filters_empty_tokens`
- `build_match_expr_escapes_double_quotes`
- `match_query_uses_bound_parameter_not_sql_format`

**TS 必测 4 项**：

- recalled 非空时拼装顺序为 `[system, system(recalled), ...recent, user]`。
- recalled 为空时不插入相关历史 system 段。
- `formatRecalled` 角色映射正确。
- `formatRecalled` 超长截断正确。

**Commit 4 验收**：

```bash
cargo test
pnpm exec tsc --noEmit
pnpm test
```

---

### Commit 5 — `docs:` close parameter and project documentation loop

**目标**：把本任务新增参数、文档入口、实施进度回流到当前文档基线。

**前置检查**：

```bash
rg -n "对话历史上下文|ChatContextBuilder|RECENT_RECORD_LIMIT|listBySession" docs/param_audit.md
rg -n "任务13|B2-13|FTS5|chat 历史" docs/03_execution/phaseb_execution_plan.md docs/ichan_project_doc.md
rg -n "任务卡|active|done|Phase B|携带矩阵" docs/docs_index.md
rg -n "persona_prompt_spec|ChatContextBuilder 三阶段|以下是相关历史" docs
```

**改动清单**：

1. `docs/param_audit.md`  
   在“对话 / UI 布局参数”或“对话历史上下文”处追加本卡参数表：

| 参数 | 值 | 位置 | 说明 |
|---|---:|---|---|
| `RECENT_TURNS_DEFAULT` | `6` | `src/services/ChatContextBuilder.ts` | 最近 6 轮 |
| `RECALL_TOP_K_DEFAULT` | `3` | `src/services/ChatContextBuilder.ts` | 召回条数 |
| `RECALL_TIME_WINDOW_DAYS` | `90` | `src-tauri/src/chat/memory.rs` | 召回时间窗 |
| `MIN_TOKEN_LENGTH` | `2` | `src-tauri/src/chat/memory.rs` | 最小 token 长度 |
| `MAX_MATCH_TOKENS` | `5` | `src-tauri/src/chat/memory.rs` | MATCH 关键词上限 |
| `BUILD_INDEX_BATCH_SIZE` | `500` | `src-tauri/src/chat/memory.rs` | 重建批大小 |
| `CHAT_MEMORY_INDEX_VERSION` | `"1"` | SQLite `config` | 索引版本 |

2. `docs/docs_index.md`  
   确认 `docs/04_task_cards/active/B2-13_task_card_v1.2.md` 已登记；若本任务完成后移动到 `done/`，同步生命周期状态。

3. `docs/03_execution/phaseb_execution_plan.md`  
   在 B2-13 / Batch 2 位置追加实施日志摘要：范围、改动文件、测试命令、验收结论。

4. `docs/ichan_project_doc.md`  
   在当前任务看板或 Phase B 任务状态处标记 B2-13 进入/完成状态；长期能力摘要只写一句，不复制任务卡细节。

**Commit 5 验收**：

```bash
pnpm exec tsc --noEmit
cargo test
rg -n "RECENT_TURNS_DEFAULT|RECALL_TOP_K_DEFAULT|RECALL_TIME_WINDOW_DAYS|MAX_MATCH_TOKENS" docs/param_audit.md
rg -n "B2-13|chat 历史 FTS5|ChatMemoryStore" docs/docs_index.md docs/03_execution/phaseb_execution_plan.md docs/ichan_project_doc.md
```

---

## 5. 最终验收清单

### 5.1 自动化

- [ ] `cargo check` 通过。
- [ ] `cargo test` 通过。
- [ ] `pnpm exec tsc --noEmit` 通过。
- [ ] `pnpm test` 通过；若项目未统一启用测试脚本，至少 TS 单测文件可由既有框架运行。

### 5.2 安全与 SQL 验收

- [ ] 仓库内不存在 `WHERE chat_memory_index MATCH '{match_expr}'`。
- [ ] 仓库内不存在 `format!(... MATCH ... match_expr ...)` 形式的 MATCH SQL 拼接。
- [ ] `MATCH` 查询使用 `?` 参数绑定。
- [ ] `chat_memory_index` DDL 不含 `content=''`。
- [ ] `chat_memory_index` DDL 不含 `prefix = '0'`。

建议检查：

```bash
rg -n "MATCH '\\{|MATCH \{match_expr\}|format!\(.*MATCH|prefix\s*=\s*'0'|content\s*=\s*''" src-tauri/src
rg -n "MATCH \?[0-9]?|chat_memory_index MATCH \?" src-tauri/src
```

### 5.3 手动验收（项目负责人）

1. 在同一会话中连续聊天，确认 `chat_messages` 正常增长。
2. 查看 `chat_memory_index`，确认 `ichan` / `user` 消息有索引行，`system` 消息无索引行。
3. 新开会话，询问“之前聊过的健身计划是什么”，确认回复能引用跨会话历史。
4. 重启应用，确认 `buildIndex` 版本一致时 no-op。
5. 删除或改写 `config.chat_memory_index_version`，重启后确认触发 rebuild。

---

## 6. 待处理开放项

| # | 项 | 决议 |
|---|---|---|
| 1 | `ChatMemoryQuery.sessionId` | 已采纳为可选字段，用于 recentWindow；调用方传 activeSessionId |
| 2 | FTS5 表模式 | 使用默认 self-managed content 模式，不是 content-less |
| 3 | `prefix` 参数 | 不配置 prefix；不做前缀索引 |
| 4 | MATCH SQL 注入面 | 必须参数化绑定 |
| 5 | talking 退出闭合 | 不在本卡；仍归 B2-9 |
| 6 | embedding / reranker | 不在本卡；后续 v3 再评估 |

---

## 7. Codex 执行顺序

严格按 Commit 0 → 5 执行。每个 commit 完成后运行该 commit 的验收命令。若中途发现需要修改 `interface_v1_2.md`、新增 `PetEvent`、新增 `MajorState` 或改变 `ChatHistoryStore` public 签名，立即停止并回报项目负责人，不得自行扩展。
