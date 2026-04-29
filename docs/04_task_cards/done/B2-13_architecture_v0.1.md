# B2-13 架构设计稿（chat 历史 FTS5 关键词记忆库）

> **版本**: v0.1 - 2026-04-29  
> **作者**: Claude（架构）  
> **状态**: 草案，待 DeepSeek 细化具体实现 → 项目负责人审定 → GPT 起任务卡 → Codex 落地  
> **任务**: B2-13（任务 13），Batch 2 首发  
> **依赖**: B0-11（chat_messages 表）✅、B1-4（ChatContextBuilder 阶段 1）✅、B0-8（persona_prompt_spec v1.0）✅  
> **本稿目的**: 锁定架构方向与边界，明确接口契约与替换路径；不锁实现细节

---

## 1. 任务定位与边界

### 1.1 范围

- 实现 `ChatMemoryStore`，提供 `buildIndex()` 与 `query()` 两个公开方法。
- 在 SQLite 中建立 FTS5 关键词索引（与 `chat_messages` 共库 `workout.sqlite`，不新增独立数据库）。
- 写入路径在 Rust 侧用 jieba-rs 做中文分词后落入索引表。
- 替换 `ChatContextBuilder` 阶段 1 实现为阶段 2，集成 recall + recentWindow 二段拼装。
- 提供 Rust 单测覆盖召回正确性 + 跨会话隔离 + 排除规则。

### 1.2 非范围

- 不上 embedding / 向量召回（保留到后续 v3 阶段）。
- 不引入 reranker、不引入 LLM 提取关键词。
- 不修改 `chat_messages` 表结构（B0-11 已冻结）。
- 不改 `MajorState` / `PetEvent` / `StateMachine` public API。
- 不改 `ChatHistoryStore` 公共方法签名（仅 ChatContextBuilder 内部行为变化）。
- 不涉及 UI、不涉及 talking 退出闭合（B2-9 范围）。

### 1.3 与 B1-4 的关系

B1-4 已交付 ChatContextBuilder 阶段 1：仅取 `listRecent(20)` 拼装。本任务把它升级为阶段 2，新增"长期记忆召回"段。B1-4 的 DeepSeekService 接口不变，但 `chat()` 调用处需要补传 `sessionId`。

---

## 2. 架构关键决策

### 2.1 决策 K1：FTS5 表与 chat_messages 解耦（独立索引表）

**选项**：

- **A. content-rowid 模式**：FTS5 虚表绑定 chat_messages 作为外部内容表。
- **B. 独立索引表（采纳）**：新建 `chat_memory_index` FTS5 虚表，存储应用层分好词的 tokens。

**采纳 B 的理由**：

- jieba 分词必须在应用层完成；FTS5 内置 tokenizer（unicode61 / porter / icu）对中文召回质量都不够。
- B 模式下 FTS5 用默认 `unicode61` tokenizer 即可工作，因为输入已经是空格分隔的 tokens。
- 删除 / 重建索引不影响 chat_messages 数据。

**Schema 形态（DDL 由 DeepSeek 细化）**：

```sql
-- 索引表（FTS5 虚表）
CREATE VIRTUAL TABLE chat_memory_index USING fts5(
  message_id UNINDEXED,    -- 关联 chat_messages.id
  session_id UNINDEXED,    -- 用于排除规则
  role UNINDEXED,          -- 'ichan' | 'user'，过滤 system
  created_at UNINDEXED,    -- 时间过滤用
  tokens,                  -- 空格分隔的 jieba 分词结果
  tokenize = 'unicode61 remove_diacritics 0'
);

-- 元数据表（schema 版本号），由 Codex 决定是否复用现有 config 表
-- 推荐复用 config 表，key = 'chat_memory_index_version'
```

### 2.2 决策 K2：分词放 Rust 侧（jieba-rs）

**选项**：

- A. TS 侧 segmentit / nodejieba
- **B. Rust 侧 jieba-rs（采纳）**

**采纳 B 的理由**：

- 写入路径已经在 Rust（`chat_append_message`）；分词与写库同事务，无需多走一次 invoke。
- jieba-rs 是纯 Rust 实现，crates.io 上稳定（约 800KB 二进制开销，可接受）。
- Rust 单测可直接断言"输入这段中文 → 应该分出哪些 token"，可重现。
- 与现有技术栈一致（B0-1 / B0-3 / B0-11 都是 Rust 主导）。

**风险与缓解**：

- jieba-rs 字典加载有 ~50ms 冷启动开销 → 在 Rust 模块用 `OnceCell<Jieba>` 全局懒加载，整个进程仅加载一次。
- 字典体积 → 用默认字典（约 5MB），足够覆盖通用中文场景；不引入 IDF 文件。

### 2.3 决策 K3：写时显式同步，不用 SQLite trigger

**选项**：

- A. SQLite trigger 自动同步 chat_messages → chat_memory_index
- **B. 应用层显式同步（采纳）**

**采纳 B 的理由**：

- trigger 内部不能跑 jieba 分词；只能用 unicode61，对中文召回质量差。
- 所有写入路径只有一处（`chat_append_message`），改动可控。
- 事务包裹 chat_messages.insert + chat_memory_index.insert，错误时一起回滚，原子性有保障。

**约束**：

- `chat_append_message` 命令必须把分词与写索引放在与主表写入同一个 SQLite 事务中。
- 若分词失败（理论上不会），用 fallback：直接把 content 按字符分隔写入 tokens 字段，保证不阻断主表写入。

### 2.4 决策 K4：召回排序 = BM25（MVP）+ 时间过滤

**MVP 排序**：

- FTS5 内置 `bm25(chat_memory_index)` 函数排序。
- 加 `WHERE created_at >= now - 90 days` 时间窗过滤，避免召回半年前的无关片段。
- `LIMIT recallTopK`（默认 3）。

**v2 优化（不在本卡范围）**：

- 时间衰减加权：`bm25_score * exp(-days_since / 30)`。
- 多样性：避免 topK 都来自同一 session（MMR-lite）。

### 2.5 决策 K5：召回与 recentWindow 去重

**问题**：召回的片段可能正好是 recentWindow 已包含的消息，会被 LLM 看到两次。

**策略**：在 `query()` 内部统一处理：

1. 先查 recentWindow（按 sessionId + 最近 N 轮）。
2. 再查 recalled（FTS5 BM25），但 SQL 层面 `WHERE message_id NOT IN (recentWindow ids)`。
3. 同时 `excludeSessionId` 应用于 recalled（不召回当前会话的任何消息）。

**注意**：当 `excludeSessionId` 等于当前会话时，recalled 已经天然排除了 recentWindow（因为 recentWindow 都在当前会话内）。但保留 `NOT IN` 兜底，避免 recentWindow 取自其他 session 的极端情况。

### 2.6 决策 K6：buildIndex 幂等

**语义**：

- 首次启动（无索引）：扫描全部 chat_messages，分词写入。
- schema 升级（索引版本号不匹配）：清空 chat_memory_index，重建。
- 已是当前版本：no-op。

**实现要点**：

- 索引版本号存 config 表，key = `chat_memory_index_version`，初版值 = `"1"`。
- 重建用单事务 + 分批 commit（每 500 条提交一次），避免大库阻塞。
- 在 App 启动后异步调用，不阻塞首屏渲染；但要在第一次 `chat()` 之前完成（用 promise gate 串起来）。

### 2.7 决策 K7：接口微调提案（需项目负责人确认）

**§2.13 现状**：

```ts
interface ChatMemoryQuery {
  currentUserMessage: string;
  recentTurns: number;
  recallTopK: number;
  excludeSessionId?: string;
}
```

**问题**：`recentWindow` 没有 sessionId 入参，无法精确取"当前会话的最近 N 轮"，只能取全局最近 N 轮，语义偏弱。

**提案**：新增一个可选字段（兼容性扩展，不破坏现有契约）：

```ts
interface ChatMemoryQuery {
  currentUserMessage: string;
  recentTurns: number;
  recallTopK: number;
  excludeSessionId?: string;
  sessionId?: string;  // 新增：用于取 recentWindow；若不提供则降级为 listRecent
}
```

**语义**：

- `sessionId` 提供 → `recentWindow = listBySession(sessionId, recentTurns * 2)`
- `sessionId` 不提供 → `recentWindow = listRecent(recentTurns * 2)`（保持向后兼容）
- 通常调用方会让 `sessionId === excludeSessionId`，但分开保持灵活性

**审核口**：本项需项目负责人确认接受后，由 Codex 同步到 §2.13；DeepSeek 细化时假定提案通过。

---

## 3. 数据流图

```
[chat_append_message]  (Rust 命令，B0-11 已存在，本卡修改其内部实现)
    │
    ├── BEGIN TRANSACTION
    │
    ├── INSERT INTO chat_messages (...)         ← 不变
    │
    ├── 若 role IN ('ichan', 'user'):           ← 新增
    │   ├── tokens = jieba.cut_for_search(content)
    │   │            .filter(len ≥ 2)
    │   │            .filter(not in stopwords)
    │   │            .join(' ')
    │   └── INSERT INTO chat_memory_index
    │       (message_id, session_id, role, created_at, tokens)
    │
    └── COMMIT


[ChatMemoryStore.query()]  (TS 侧，invoke Rust 命令)
    │
    ├── invoke('chat_memory_query', {
    │     currentUserMessage,
    │     sessionId, excludeSessionId,
    │     recentTurns, recallTopK,
    │   })
    │
    ▼
[chat_memory_query]  (Rust 命令，新增)
    │
    ├── 1. recentWindow:
    │      若 sessionId 给定:
    │        SELECT * FROM chat_messages
    │        WHERE session_id = ?
    │        ORDER BY id DESC LIMIT recentTurns*2
    │      否则:
    │        SELECT * FROM chat_messages
    │        ORDER BY id DESC LIMIT recentTurns*2
    │
    ├── 2. queryTokens = jieba.cut_for_search(currentUserMessage)
    │                         .filter(len ≥ 2)
    │                         .filter(not in stopwords)
    │
    ├── 3. 若 queryTokens 为空 → recalled = []
    │      否则:
    │        match_expr = queryTokens.join(' OR ')
    │        SELECT m.* FROM chat_messages m
    │        JOIN chat_memory_index idx ON idx.message_id = m.id
    │        WHERE idx.tokens MATCH ?
    │          AND idx.session_id != ?  -- excludeSessionId
    │          AND m.id NOT IN (recentWindow.ids)
    │          AND idx.created_at >= ? -- now - 90 days
    │        ORDER BY bm25(chat_memory_index) ASC -- bm25 越小越相关
    │        LIMIT recallTopK
    │
    └── 返回 { recalled, recentWindow }
        recentWindow 反转为时间正序


[ChatContextBuilder.getChatContext()]  (TS 侧，本卡升级)
    │
    ├── memResult = chatMemoryStore.query({...})
    │
    ├── messages = [systemPrompt]
    │
    ├── 若 memResult.recalled 非空:
    │   messages.push({
    │     role: 'system',
    │     content: '以下是相关历史:\n' + formatRecalled(memResult.recalled)
    │   })
    │
    ├── messages.push(...mapToOpenAI(memResult.recentWindow))
    │       (role: 'ichan' → 'assistant'; 过滤 system)
    │
    ├── messages.push({ role: 'user', content: currentUserMessage })
    │
    └── return messages
```

---

## 4. 接口契约（最终形态）

### 4.1 ChatMemoryStore（TS 侧）

```ts
// src/services/ChatMemoryStore.ts （新增）

export interface ChatMemoryQuery {
  currentUserMessage: string;
  recentTurns: number;        // default 6
  recallTopK: number;         // default 3
  excludeSessionId?: string;  // 不召回当前会话
  sessionId?: string;         // 新增（K7 提案）：用于 recentWindow
}

export interface ChatMemoryResult {
  recalled: ChatMessageRecord[];     // 时间正序
  recentWindow: ChatMessageRecord[]; // 时间正序
}

export interface ChatMemoryStore {
  buildIndex(): Promise<void>;
  query(input: ChatMemoryQuery): Promise<ChatMemoryResult>;
}

export class ChatMemoryStoreImpl implements ChatMemoryStore {
  // invoke('chat_memory_build_index')
  // invoke('chat_memory_query', { ... })
}
```

### 4.2 Rust 命令

| 命令 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `chat_memory_build_index` | `()` | `{ rebuilt: bool, indexed: u32 }` | 幂等，已是当前版本则 no-op |
| `chat_memory_query` | `ChatMemoryQuery` | `ChatMemoryResult` | 单次召回，6s 内返回 |

`chat_append_message` 签名不变，但内部行为扩展为"分词 + 写索引"。

### 4.3 ChatContextBuilder 阶段 2 接口变化

```ts
// 阶段 1（B1-4 现状）
class ChatContextBuilder {
  getChatContext(currentUser: string): Promise<ChatMessage[]>
}

// 阶段 2（本卡）
class ChatContextBuilder {
  constructor(
    private chatHistoryStore: ChatHistoryStore,
    private chatMemoryStore: ChatMemoryStore,  // 新增依赖
  ) {}
  
  getChatContext(
    currentUser: string,
    sessionId: string,  // 新增：来自 B1-10 对话 UI 的 activeSessionId
  ): Promise<ChatMessage[]>
}
```

**调用方影响**：

- B1-4 的 `DeepSeekService.chat()` 需要补传 sessionId。
- B1-10 对话 UI 已有 `activeSessionId`（见 `talking_interaction_schema.md` §13），透传到 `chat()` 即可。
- 入口在 B2-9 闭合 talking 退出时一并核对，不在本卡内修改 UI 代码。

---

## 5. 参数清单（提交给 param_audit.md）

| 参数 | 默认值 | 位置 | 说明 |
|---|---|---|---|
| `RECENT_TURNS_DEFAULT` | `6` | `ChatContextBuilder.ts` | 取最近 N 轮 = 2N 条 |
| `RECALL_TOP_K_DEFAULT` | `3` | `ChatContextBuilder.ts` | FTS5 召回条数 |
| `RECALL_TIME_WINDOW_DAYS` | `90` | `chat/memory.rs` | 召回时间窗，超出不返回 |
| `MIN_TOKEN_LENGTH` | `2` | `chat/memory.rs` | 单字 token 不入索引 |
| `BUILD_INDEX_BATCH_SIZE` | `500` | `chat/memory.rs` | 重建索引每事务条数 |
| `CHAT_MEMORY_INDEX_VERSION` | `"1"` | `config` 表 | 索引 schema 版本 |
| `STOPWORDS_ZH` | 见 §6 | `chat/memory.rs` | 停用词表 |

---

## 6. 留给 DeepSeek 细化的待补条目

以下是架构层故意不锁、留给 DeepSeek 细化的具体实现细节：

1. **DDL 完整 SQL**：
   - `chat_memory_index` 虚表的精确 DDL（含 tokenize 参数）
   - 是否需要额外辅助索引（理论上 FTS5 不需要，但 UNINDEXED 字段查询需评估）

2. **jieba-rs 调用方式**：
   - `cut_for_search` vs `cut(hmm=true)` vs `cut_with_tag` 的选择
   - 是否需要加载用户词典（项目相关术语，比如"i酱"、"科研日志"）
   - 字典加载方式（OnceCell vs lazy_static）

3. **停用词表**：
   - 中文停用词常见列表（建议参考 baidu_stopwords 或 哈工大 stopwords）
   - 是否包含英文停用词（the / is / a 等）
   - 是否过滤标点符号（jieba 可能保留全角标点）

4. **FTS5 MATCH 语法**：
   - `'kw1 OR kw2 OR kw3'` vs `'kw1 kw2 kw3'`（隐含 AND）的召回质量对比
   - 引号转义处理（用户消息可能含 `'` `"`）
   - 关键词数量上限（避免 SQL 过长）

5. **buildIndex 触发时机**：
   - App 启动后多久触发？建议在 StateMachine.start() 之后异步触发
   - 是否在 `chat()` 调用时强制 await（保证索引可用）？
   - 失败重试策略

6. **formatRecalled() 文本格式**：
   - 召回片段如何组装成可读 system 消息
   - 建议：`[role: timestamp] content` 一行一条，或更紧凑的 `<role @ time>: content`
   - 字符上限（避免 prompt 过长）

7. **测试用例集**（Rust 单测 + TS 集成测）：
   - 写入 → 召回 → 排除规则 → 跨会话隔离
   - jieba 分词正确性断言
   - 时间窗过滤
   - 空 query / 空索引 / 单字 query 等边界情况
   - buildIndex 幂等性（连续调用两次结果一致）
   - 大库性能（1 万条消息下 query 应 < 100ms）

8. **错误处理细节**：
   - jieba 字典加载失败时的降级路径
   - FTS5 编译标志缺失时的检测（rusqlite 默认带 fts5 feature 吗？需确认）
   - 索引损坏时的自动 rebuild 触发

9. **persona_prompt_spec.md §3.3 对齐**：
   - DeepSeek 细化时要核对该 spec §3.3 关于"getChatContext 三阶段实现"的字面规范，确保前缀文案、role 映射规则与之一致

---

## 7. 边界与非范围（再次重申）

- ❌ 不修改 `chat_messages` 表 schema
- ❌ 不修改 `MajorState` / `PetEvent` / `StateMachine` public API
- ❌ 不修改 `ChatHistoryStore.append/listBySession/listRecent` 签名
- ❌ 不引入 embedding / 向量
- ❌ 不动 UI / B1-10 对话组件
- ❌ 不闭合 talking 退出（属于 B2-9）
- ✅ 修改 `ChatContextBuilder` 内部行为 + 构造签名（接受 `ChatMemoryStore` 依赖）
- ✅ 扩展 `chat_append_message` 内部实现（同事务写索引表）
- ✅ 新增 `chat_memory_build_index` / `chat_memory_query` Rust 命令
- ✅ 新增 `chat_memory_index` FTS5 虚表
- ⚠️ `ChatMemoryQuery` 接口微调（增加可选 `sessionId`），需项目负责人审定

---

## 8. 验收策略

### 8.1 单元测试（Rust，硬门槛）

- `cargo test` 覆盖：
  - `append_message_writes_to_both_tables`
  - `append_system_role_does_not_index`（system 不入索引，对齐持久化语义）
  - `query_returns_recent_window_in_chronological_order`
  - `query_recalled_excludes_current_session`
  - `query_recalled_excludes_recent_window`
  - `query_with_empty_keywords_returns_empty_recalled`
  - `query_respects_time_window`
  - `build_index_is_idempotent`
  - `build_index_rebuilds_after_version_bump`
  - `jieba_segmentation_filters_short_tokens_and_stopwords`

### 8.2 集成测试（TS）

- `pnpm exec tsc --noEmit` 通过
- ChatContextBuilder 阶段 2 单测：传入 mock ChatMemoryStore → 断言 messages 拼装顺序符合 `[system, recallPrefix?, ...recentWindow, user]`

### 8.3 项目负责人手测

1. 在 chat 中聊几次，DevPanel 观察 `chat_memory_index` 表行数与 `chat_messages` 是否同步增长
2. 跨会话提问历史话题（先开新会话，问"之前聊过的健身计划是什么"），观察 LLM 回复是否引用了召回内容
3. 关闭应用、重启，确认 buildIndex 不重复执行
4. 删除 `app.sqlite` 中的 `chat_memory_index_version`，重启确认触发 rebuild

---

## 9. 后续动作

| # | 动作 | 责任方 | 输入 |
|---|---|---|---|
| 1 | 项目负责人审定本稿，特别是 K7 接口微调提案 | 项目负责人 | 本文档 |
| 2 | DeepSeek 基于本稿细化实现细节（§6 待补条目） | DeepSeek | 本文档 + persona_prompt_spec.md + B0-11 实施报告 |
| 3 | GPT 基于细化结果起 B2-13 任务卡，挂到 `docs/04_task_cards/active/` | GPT | DeepSeek 细化稿 + 本文档 |
| 4 | Codex 落地实现，产出 B2-13 实施报告 | Codex | 任务卡 |
| 5 | Claude 终审 + 同步 §2.13 接口（若 K7 通过）+ 更新 phaseb_execution_plan.md §3.2.3 + 更新 ichan_project_doc.md §9.3 | Claude | Codex 实施报告 |

---

## 10. 版本

- v0.1 - 2026-04-29 - 初稿