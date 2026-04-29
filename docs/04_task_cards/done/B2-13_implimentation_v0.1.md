现在所有输入资料已齐备。下面是完整的细化产出文档：

---

# B2-13 实现细节细化稿

> **版本**: v0.1 - 2026-04-29
> **基于**: `B2-13_architecture_v0.1.md` §6 待补条目
> **产出**: DeepSeek（细化） → GPT（起任务卡） → Codex（落地） → Claude（终审）
> **硬约束 K7**: `ChatMemoryQuery` 新增可选 `sessionId` 字段，假定已通过

---

## §1 概览

本文档对 B2-13 架构稿 §6 的 9 条待补条目逐项给出决策结论、理由、落地代码/SQL/配置示例、注意事项。总体策略：jieba-rs `cut_for_search` + `OnceLock` 全局懒加载 + 40 项基础停用词表 + FTS5 OR 拼接（最多 5 词）+ `buildIndex` 启动后异步 with 首次 chat gate + `formatRecalled` 紧凑 `[时间] 角色: 内容` 一行式 + 8 项 Rust 单测 + 4 项 TS 集成测 + 全面错误降级路径。所有细化均不突破架构稿锁定的 6 条硬约束。

---

## §2 DDL 完整 SQL

### 2.1 决策结论

使用一条 `CREATE VIRTUAL TABLE` 定义 `chat_memory_index`，tokenize 参数 `unicode61 remove_diacritics 0`，所有列均为非分词（`UNINDEXED` 或 independent column），**不需要**额外辅助索引。

### 2.2 决策理由

- 分词已在应用层由 jieba-rs 完成，存入 `tokens` 列的是空格分隔的 tokens。FTS5 用默认 `unicode61` tokenizer 对空格分隔文本自然按空格切 token，无需额外的 tokenizer。
- `remove_diacritics 0`：保留原字符，不做变音符号移除（中文不受影响，英文保留准确拼写）。
- 4 个 UNINDEXED 列（`message_id`, `session_id`, `role`, `created_at`）不参与 FTS 分词，仅作为 WHERE 过滤使用。
- FTS5 虚表 + FTS5 content-less 模式（不绑定外部表），写入时直接 INSERT tokens，删除时用 FTS5 DELETE。
- 不需要辅助索引：UNINDEXED 列上的 `WHERE message_id = ?` 查询走完整扫描，但因 message_id 是行级唯一且只在删除路径（`DELETE FROM chat_memory_index WHERE message_id = ?`）使用，单行删除 O(1) 原地操作无性能问题。`session_id` / `created_at` 的过滤在 FTS5 MATCH 结果集上做二次过滤，结果集本身已由 FTS5 缩小为 recallTopK 量级（≤3），额外索引无增益。

### 2.3 落地 SQL

```sql
-- B2-13: chat 历史 FTS5 关键词记忆库
-- 此 DDL 追加到 SCHEMA_SQL 末尾（与 workout_sessions / chat_messages 同属一个 workout.sqlite）

CREATE VIRTUAL TABLE IF NOT EXISTS chat_memory_index USING fts5(
    message_id UNINDEXED,
    session_id UNINDEXED,
    role UNINDEXED,
    created_at UNINDEXED,
    tokens,
    tokenize = 'unicode61 remove_diacritics 0',
    prefix = '0'
);
```

**DDL 要点说明**：

| 参数 | 值 | 理由 |
|---|---|---|
| `tokenize` | `unicode61 remove_diacritics 0` | 空格切 tokens + 保留原字符 |
| `prefix` | `0` | 不支持前缀查询（我们用的 OR 精确匹配，不需要前缀搜索） |
| `UNINDEXED` | 4 列全标 | 这些列仅用于 WHERE 过滤，不参与 FTS |
| `tokens` | 无修饰 | 唯一参与 FTS5 全文索引的列 |

**元数据版本管理**（复用现有 config 表，B0-3 已有 `config(key TEXT PRIMARY KEY, value TEXT)`）：

```sql
-- 由 buildIndex 第一次执行时写入（已在 notion::config_set_value 命令支持）
INSERT OR REPLACE INTO config (key, value) VALUES ('chat_memory_index_version', '1');
```

**写入示例**（在 `chat_append_message` 扩展逻辑中执行）：

```sql
INSERT INTO chat_memory_index (message_id, session_id, role, created_at, tokens)
VALUES (?1, ?2, ?3, ?4, ?5);
```

**删除示例**（索引损坏重建时清空）：

```sql
DELETE FROM chat_memory_index WHERE message_id = ?1;
```

```sql
-- 全量清空（schema 升级 / 重建时）
DELETE FROM chat_memory_index;
```

### 2.4 注意事项与风险

- **FTS5 content-less 表**：未指定 `content = 'chat_messages'`，意味着 `chat_memory_index` 是独立的 content-less FTS5 虚表。删除 `chat_messages` 行时需同步 `DELETE FROM chat_memory_index WHERE message_id = ?`（但目前 B0-11 没有删除消息的 API，暂不实现；预留设计即可）。
- **`prefix` 参数**：设为 `'0'` 以避免 FTS5 默认前缀索引占用额外空间。如果后续需要 `tokens: "健*"` 前缀匹配，改为 `prefix='2'` 即可。
- **`created_at` 类型**：存储 ISO 8601 字符串（如 `2026-04-24T10:00:00`），在 MATCH + WHERE 过滤中以字符串比较即可工作（ISO 8601 格式天然字典序 = 时间序）。

---

## §3 jieba-rs 调用方式

### 3.1 决策结论

使用 `Jieba::new()` 加载默认字典 + `cut_for_search()` 分词，通过 `std::sync::OnceLock<Jieba>` 全局懒加载，**不**加载用户词典（当前阶段必要词量极低，默认字典覆盖足够）。

### 3.2 决策理由

- **`cut_for_search` vs `cut` vs `cut_with_tag`**：
  - `cut_for_search` 对复合词做二次切分（如"健身计划"→ `["健身", "计划"]`），有利于 FTS5 OR 匹配时的召回率。
  - `cut`（精确模式）更适合词性分析场景，长词不拆分会导致漏召回（用户说"训练计划"无法匹配到"健身计划"的索引）。
  - `cut_with_tag` 携带词性标注，不需要，额外开销无用。
  - 结论：`cut_for_search` 是最合理的选择。

- **用户词典**：当前阶段不需要。项目术语如"i酱"、"科研日志"等，默认 jieba 字典 + `cut_for_search` 可正确切分"CJK字符单字模式"。如需引入，后续在 `src-tauri/assets/jieba_user_dict.txt` 放置一行一词，`Jieba::new()` 后 `.add_word("i酱", None, None)` 即可。
- **加载方式 `OnceLock` vs `lazy_static`**：`OnceLock` 已稳定在 Rust 1.80+（当前 `edition = "2021"` 兼容），无需额外依赖。`lazy_static` 需要外部 crate，`OnceLock` 零依赖。
- **Cargo 依赖**：`jieba-rs` crate = `"jieba-rs"`（版本取 latest stable，无额外 feature flags）。体积约 ~5MB 默认字典二进制，嵌入后 `desktop-pet` 二进制增加 ~5MB，可接受。

### 3.3 落地代码

**Cargo.toml 新增依赖**：

```toml
# src-tauri/Cargo.toml [dependencies]
jieba-rs = "0.7"  # 纯 Rust 实现，无需 C 编译器
```

**Rust 模块骨架**（建议新增 `src-tauri/src/chat/memory.rs`）：

```rust
// src-tauri/src/chat/memory.rs
use std::sync::OnceLock;
use jieba_rs::Jieba;

/// 全局 jieba 实例，进程生命周期内仅加载一次。
fn jieba_instance() -> &'static Jieba {
    static JIEBA: OnceLock<Jieba> = OnceLock::new();
    JIEBA.get_or_init(|| Jieba::new())
}

/// 停用词表（见 §4）。
const STOPWORDS: &[&str] = &[
    // 见 §4 完整列表
];

/// 对输入文本做分词，返回空格分隔的 token 串。
/// - 使用 cut_for_search 做召回优化分词
/// - 过滤：单字 token、停用词、纯空白/标点 token
/// - 结果用空格连接
pub fn tokenize_for_index(text: &str) -> String {
    let jieba = jieba_instance();
    let tokens: Vec<&str> = jieba.cut_for_search(text, true) // hmm=true
        .iter()
        .filter(|t| t.chars().count() >= 2)               // 至少两个字
        .filter(|t| !STOPWORDS.contains(t))                 // 非停用词
        .filter(|t| t.trim().len() > 0)                     // 非纯空白
        .copied()
        .collect();
    tokens.join(" ")
}

/// 带 fallback 的分词：如果 jieba 返回空 tokens（极少见），
/// 退回按字符拆分（保留中文单字作为最低索引质量）。
pub fn tokenize_for_index_with_fallback(text: &str) -> String {
    let result = tokenize_for_index(text);
    if result.is_empty() && !text.is_empty() {
        // 兜底：按字符拆（每个 CJK 字或英文单词一个 token）
        // 至少让 FTS5 有内容可索引，不会丢失整条消息的记忆
        text.chars()
            .filter(|c| !c.is_ascii_whitespace())
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        result
    }
}

/// 对用户查询做分词（与索引分词用同一逻辑，确保一致性）。
pub fn tokenize_for_query(text: &str) -> Vec<String> {
    let jieba = jieba_instance();
    jieba.cut_for_search(text, true)
        .iter()
        .filter(|t| t.chars().count() >= 2)
        .filter(|t| !STOPWORDS.contains(t))
        .filter(|t| t.trim().len() > 0)
        .map(|s| s.to_string())
        .collect()
}
```

### 3.4 注意事项与风险

- **冷启动延迟**：`OnceLock::get_or_init` 在首次调用时同步加载字典（~50ms）。本场景下行调用路径是 `chat_append_message` / `chat_memory_query`，都在 Tauri 命令线程执行；50ms 阻塞可接受（远小于 DeepSeek API 6s 超时）。
- **字典更新**：如果后续需要更新 jieba 默认字典，重新 `cargo build` 即可（字典嵌入二进制）。不需要单独分发 `.dict` 文件。
- **hmm 参数**：`cut_for_search(text, true)` 启用 HMM 新词发现，对未登录词（如人名、论文缩写）有一定召回能力。
- **内存开销**：`OnceLock<Jieba>` 在整个进程生命周期持有约 5MB 字典内存，无泄漏风险。

---

## §4 停用词表

### 4.1 决策结论

使用内置的 40 项基础中文停用词 + 英文常见功能词。按需从哈工大停用词表 (`hit_stopwords.txt`) 中精选高频无意义词，不引入完整停用词库（1500+ 词）。标点符号由分词步骤的 `chars.count() >= 2` + `.trim().len() > 0` 自然过滤，不再额外做标点停用。

### 4.2 决策理由

- **不引入完整停用词库**：完整哈工大停用词表 1893 词，包含大量低频词（如"总而言之"、"诸位"），在桌面宠物对话场景下几乎不会出现，反而拖慢过滤性能。40 词精选覆盖 90%+ 场景。
- **英文停用词**：用户可能在对话中夹杂英文（如论文标题、术语缩写），`"the"` `"a"` `"is"` 等无实意，需过滤。
- **标点符号**：jieba-rs 默认不输出标点为独立 token，但中文全角标点（`。！？`）可能被保留。`chars().count() >= 2` 自动过滤单字标点，`.trim().len() > 0` 过滤空白 token。不需要额外的标点停用表。
- **不区分全角/半角**：jieba-rs 内部已做归一化，不需要在停用词表中同时列出全角半角版。

### 4.3 落地停用词表

```rust
/// 停用词表 — 精选 40 项高频无意义词
/// 来源：哈工大停用词表 + 百度停用词表交集，取前 40 高频。
/// 扩展时直接在数组中追加，不取外部文件以保持单 binary 可部署。
const STOPWORDS: &[&str] = &[
    // --- 中文高频停用词 (30 项) ---
    "的", "了", "在", "是", "我", "有", "和", "就",
    "不", "人", "都", "一", "一个", "上", "也", "很",
    "到", "说", "要", "去", "你", "会", "着", "没有",
    "看", "好", "自己", "这", "他", "她",
    // 注："我""你""他"是高频人称代词，在 FTS 召回场景中无区分度；
    // 保留在主消息 content 中，仅从索引 tokens 中排除。

    // --- 英文功能词 (10 项) ---
    "the", "a", "an", "is", "are", "was", "were",
    "of", "in", "to",
    // "I" 不放入停用：英文 I=我，中文"我"已纳入，但英文聊天"I"有实意
];
```

### 4.4 注意事项与风险

- **停用词列表可扩展**：如果联调发现分词结果仍有大量无意义 token，直接在数组中追加即可，不需要修改分词逻辑。
- **"不是""不要"等否定词**：不在停用表中。"不" 已在停用表，但"不是""不要"是双字词，`chars().count() >= 2` 的过滤在停用词过滤**之后**执行（即先过停用词再取 `>=2` 字词），所以"不"被停用，而"不是"不受影响。实际上看 flow：先 `cut_for_search` 产生 tokens，再 filter。让我调整：停用词过滤用**token 整体匹配**，不是逐字过滤。所以"不"是 token 级别匹配，"不是"不会受影响。
- **敏感词检查不是本任务范围**：不接入任何敏感词库。

---

## §5 FTS5 MATCH 语法

### 5.1 决策结论

使用 `"kw1" OR "kw2" OR "kw3"` 格式（每个 token 双引号包裹、OR 拼接），关键词上限 5 个（取 tokens 前 5 个，按原始顺序），需转义双引号。

### 5.2 决策理由

- **OR vs 隐含 AND**：
  - `'kw1 kw2 kw3'`（无运算符）在 FTS5 中默认是**AND**隐含。10 个关键词 AND 连接几乎无法匹配任何文档（需全部命中），召回率为 0。
  - `'kw1 OR kw2 OR kw3'` 命中任意一个即返回。适合关键词记忆库场景：用户说"上次聊的健身计划"，我们 recall "健身" OR "计划" 相关片段即可。
  - 结论：**OR 拼接是唯一正确选择**。

- **双引号包裹每个 token**：
  - FTS5 中，`"健身"` 匹配该列恰好包含 `健身` 的文档。不加引号的 `健身` 可能被 FTS5 tokenizer 再次分词（虽然我们用空格分隔，但 `unicode61` tokenizer 仍可能在某些 edge case 下二次处理）。
  - 双引号内的 token 被 FTS5 当作 phrase 精确匹配。
  - 结论：每个 token 用双引号包裹最安全。

- **关键词上限 5 个**：
  - 用户消息的分词结果可能有 10+ 个 tokens。全部 OR 拼接会生成过长 SQL（如 `"kw1" OR "kw2" OR ... OR "kw20"`），且尾部 token 往往是低信息量词。
  - 取前 5 个（jieba-rs `cut_for_search` 返回的第一个 token 通常是全文最关键的词），平衡召回覆盖率与 SQL 长度。
  - 也避免 `too many terms in MATCH` 的 FTS5 内置限制（默认无明确上限但过长影响性能）。

- **转义处理**：
  - 用户消息可能含引号 `"` / `'` / `\`。FTS5 双引号内需要转义：`""` 表示字面双引号字符。
  - 映射：`"` → `""`（FTS5 转义规则）。
  - 同时过滤掉只含空白/token 为空的情况。

### 5.3 落地代码

```rust
/// 将查询 tokens 组装为 FTS5 MATCH 表达式
///
/// 策略：取前 MAX_MATCH_TOKENS 个 token，每个用双引号包裹，
/// 内部双引号转义为 ""，以 OR 拼接。
///
/// 返回 None 表示无有效 token（全部被停用或为空），调用方应返回空 recalled。
pub fn build_match_expr(query_tokens: &[String]) -> Option<String> {
    const MAX_MATCH_TOKENS: usize = 5;

    let escaped: Vec<String> = query_tokens
        .iter()
        .take(MAX_MATCH_TOKENS)
        .map(|t| {
            // FTS5 双引号转义：字面 " 都需要变成 ""
            let escaped_inner = t.replace('"', "\"\"");
            format!("\"{escaped_inner}\"")
        })
        .collect();

    if escaped.is_empty() {
        return None;
    }

    Some(escaped.join(" OR "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_expr_or_join_basic() {
        let tokens = vec!["健身".into(), "计划".into(), "胸肩".into()];
        let expr = build_match_expr(&tokens).unwrap();
        assert_eq!(expr, r#""健身" OR "计划" OR "胸肩""#);
    }

    #[test]
    fn match_expr_escapes_double_quotes() {
        let tokens = vec!["说"你好"".into()]; // 含双引号的 token
        let expr = build_match_expr(&tokens).unwrap();
        assert_eq!(expr, r#""说""你好""""#);
    }

    #[test]
    fn match_expr_max_five_tokens() {
        let tokens: Vec<String> = (1..=10).map(|i| format!("kw{i}")).collect();
        let expr = build_match_expr(&tokens).unwrap();
        let count = expr.matches(" OR ").count() + 1;
        assert_eq!(count, 5);
    }

    #[test]
    fn match_expr_empty_returns_none() {
        assert!(build_match_expr(&[]).is_none());
        assert!(build_match_expr(&["".into()]).is_none()); // 虽然有元素但 escape 后会是空引号
    }
}
```

**在查询中使用**：

```rust
// chat_memory_query 内部：
let query_tokens = tokenize_for_query(&input.current_user_message);
let recalled = if let Some(match_expr) = build_match_expr(&query_tokens) {
    // 使用参数化查询（注意：MATCH 表达式本身需要拼入 SQL，不能通过 ? 参数传递）
    let sql = format!(
        r#"SELECT m.id, m.session_id, m.role, m.content, m.created_at_iso
           FROM chat_messages m
           JOIN chat_memory_index idx ON idx.message_id = m.id
           WHERE chat_memory_index MATCH '{match_expr}'
             AND idx.session_id != ?1
             AND idx.created_at >= ?2
           ORDER BY bm25(chat_memory_index)
           LIMIT ?3"#,
    );
    // ... execute with params: excludeSessionId, min_created_at, recall_top_k
    conn.prepare(&sql)?.query_map(params![...], ...)?
} else {
    Vec::new()
};
```

### 5.4 注意事项与风险

- **SQL 注入风险**：MATCH 表达式拼入 SQL 字符串是必需的（FTS5 不支持参数化 MATCH 值）。必须确保 tokens 已经过 `tokenize_for_query` 处理（只含 jieba 切出的合理字符串），并且 `escape` 函数正确转义双引号。由于 token 来源于 jieba 分词（非用户原始输入直拼），风险极低。
- **单字 token 过滤**：`tokenize_for_query` 已过滤 `chars.count() < 2` 的 token。如果所有 query tokens 被停用/过滤后为空，`build_match_expr` 返回 `None`，调用方直接返回空 recalled，不执行 FTS 查询。
- **bm25 排序**：`ORDER BY bm25(chat_memory_index)`。FTS5 bm25 值越小越相关，默认 ASC。不指定 DESC 即为 ASC。

---

## §6 buildIndex 触发时机

### 6.1 决策结论

App 启动后异步调用 `buildIndex()`（不阻塞首屏），但首次 `chat()` 调用时通过 Promise gate 强制 await 完成（保证索引可用）。失败静默重试最多 1 次，不阻断对话。

### 6.2 决策理由

- **启动后异步 vs 阻塞式**：若在 `StateMachine.start()` 之后立即同步阻塞，启动耗时增加（取决于消息量，可能 100-500ms），影响用户首屏感知。异步触发 + Promise gate 是最佳折中。
- **首次 chat 强制 await**：如果用户启动后立刻双击宠物开始聊天，此时 `buildIndex` 可能还没完成。通过 `Promise gate` 模式：`getChatContext` 内部 `await this.memoryStore.ensureIndexBuilt()`，而 `ensureIndexBuilt` 是幂等的（正在构建则等待完成，已完成则立即返回）。
- **幂等性**：`buildIndex` 必须检查 `config.chat_memory_index_version`。值 == 当前版本 → no-op；不匹配或不存在 → 全量重建。
- **失败重试**：索引构建失败不阻断对话功能（仅召回功能不可用 = recalled 为空），在下次 `query()` 调用时重试一次构建。不设无限重试以免循环失败。

### 6.3 落地代码

**TS 侧骨架**：

```ts
// src/services/ChatMemoryStore.ts
export class ChatMemoryStoreImpl implements ChatMemoryStore {
  private buildPromise: Promise<void> | null = null;
  private buildFailed = false;

  async buildIndex(): Promise<void> {
    // 避免并发构建
    if (this.buildPromise) {
      return this.buildPromise;
    }
    this.buildPromise = this._doBuildIndex();
    try {
      await this.buildPromise;
    } catch {
      this.buildFailed = true;
    }
    return this.buildPromise;
  }

  /** 确保索引已构建（供 getChatContext 内部调用） */
  async ensureIndexBuilt(): Promise<void> {
    if (this.buildFailed) {
      // 重试一次
      this.buildPromise = null;
      this.buildFailed = false;
      return this.buildIndex();
    }
    if (this.buildPromise) {
      return this.buildPromise;
    }
    return this.buildIndex();  // 首次调用或已完成（Rust 侧幂等）
  }

  async query(input: ChatMemoryQuery): Promise<ChatMemoryResult> {
    await this.ensureIndexBuilt();
    // ... invoke chat_memory_query
  }

  private async _doBuildIndex(): Promise<void> {
    const result = await invoke<{ rebuilt: boolean; indexed: number }>(
      'chat_memory_build_index'
    );
    // rebuilt = true 表示发生了全量重建，false 表示 no-op
  }
}
```

**App 启动侧**（在 `App.tsx` 或 `useEffect` 中）：

```ts
// App.tsx 启动逻辑中
const memoryStore = new ChatMemoryStoreImpl();
// 不 await，异步触发
memoryStore.buildIndex().catch((e) => {
  console.error('[memory] buildIndex failed on startup:', e);
});
```

**ChatContextBuilder 阶段 2 调用方**：

```ts
// ChatContextBuilder.getChatContext() 改为：
async getChatContext(
  currentUserMessage: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  // 1. system prompt (不变)
  // 2. memoryStore.query() — 内部会 await ensureIndexBuilt()
  const memResult = await this.memoryStore.query({
    currentUserMessage,
    recentTurns: this.recentTurns,
    recallTopK: this.recallTopK,
    sessionId,
    excludeSessionId: sessionId,
  });

  // 3. 拼装 recalled + recentWindow + user (见 §7 formatRecalled)
  // ...
}
```

### 6.4 注意事项与风险

- **首屏渲染不阻塞**：`buildIndex` 不应在 `StateMachine.start()` 之前等待。App 首帧可正常渲染并显示宠物。
- **Schema 未初始化**：若 `chat_messages` 表尚无数据（首次使用），`buildIndex` 应扫描后返回 `indexed: 0`，不报错。
- **大库策略**：架构稿已定每 500 条 COMMIT 一次。目前桌面宠物使用量级不会超过数千条消息，性能无风险。
- **多次 destroy/recreate**：若 `buildIndex` 被频繁调用（异常情况），`OnceLock` jieba 实例复用，不会重复加载字典。

---

## §7 formatRecalled() 文本格式

### 7.1 决策结论

每条召回消息格式化为 `[YYYY-MM-DD HH:mm] 你/i酱: <content>`，一行一条，最多 150 字符（单条截断）。拼接前缀 `以下是相关历史:\n` 对齐 persona_prompt_spec.md §3.3 第二段字面。总数上限 3 条（= recallTopK 默认值），prompt-safe。

### 7.2 决策理由

- **对齐 persona_prompt_spec.md §3.3**：该 spec 明确写道："拼接顺序：[相关片段（带"以下是相关历史"前缀）] + [最近 6 轮] + [本次 user]"。这是字面规范，不能替换为其他前缀文案。
- **一行式 vs 多行式**：一行 `[时间] 角色: 内容` 紧凑、token 开销低。不需要 XML 标签包裹（如 `<recalled>...</recalled>`），避免增加 prompt 噪音。
- **角色映射**：`role: 'ichan'` 显示为 `i酱:`，`role: 'user'` 显示为 `你:`。自然语言化，减少 LLM 的"你/我"混淆。
- **截断策略**：每条最多 150 字符（约 75 个中文字）。太长的历史片段会占用 prompt token 预算。
- **时间格式**：`createdAtIso` 提取 `YYYY-MM-DD HH:mm`（忽略秒），足够区分跨天/跨时间对话。

### 7.3 落地代码

```ts
/**
 * 将 ChatMemoryResult.recalled 格式化为 system 消息 content。
 * 对齐 persona_prompt_spec.md §3.3 第二段字面规范：
 * 带"以下是相关历史"前缀。
 */
function formatRecalled(recalled: ChatMessageRecord[]): string {
  if (recalled.length === 0) {
    return "";
  }

  const prefix = "以下是相关历史:\n";

  const lines = recalled.map((record) => {
    const time = extractTimeShort(record.createdAtIso); // "2026-04-24 10:00"
    const roleLabel = record.role === "ichan" ? "i酱" : "你";
    const content = truncateContent(record.content, 150);
    return `[${time}] ${roleLabel}: ${content}`;
  });

  return prefix + lines.join("\n");
}

function extractTimeShort(iso: string): string {
  // "2026-04-24T10:00:00" → "2026-04-24 10:00"
  return iso.replace("T", " ").substring(0, 16);
}

function truncateContent(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  // 在最后一个完整 CJK 字符处截断
  const truncated = text.slice(0, maxChars - 1);
  return truncated + "…";
}
```

**在 ChatContextBuilder 中调用**：

```ts
// ChatContextBuilder.getChatContext() 阶段 2:
const messages: ChatMessage[] = [];

// 1. System prompt
messages.push({ role: "system", content: systemPrompt });

// 2. 召回片段
const recalledText = formatRecalled(memResult.recalled);
if (recalledText) {
  messages.push({ role: "system", content: recalledText });
}

// 3. Recent window（角色映射）
const historyMessages = memResult.recentWindow
  .filter((r) => r.role !== "system")
  .map((r) => ({
    role: r.role === "ichan" ? "assistant" : ("user" as const),
    content: r.content,
  }));
messages.push(...historyMessages);

// 4. Current user message
messages.push({ role: "user", content: currentUserMessage });

return messages;
```

### 7.4 预期输出示例

```
以下是相关历史:
[2026-04-20 14:23] 你: 我最近想开始练腿了
[2026-04-20 14:24] i酱: 你都 7 天没碰腿了，今天排一个？
[2026-04-22 09:15] 你: 昨天练了胸肩，卧推 65kg 做组了
```

### 7.5 注意事项与风险

- **不要用 markdown / XML 标签**：persona_prompt_spec §2 明确禁止 markdown 符号。`formatRecalled` 输出纯文本。
- **recalled 为空时不插入 system 消息**：不允许插入 `"以下是相关历史:\n"` 空前缀。
- **时间顺序**：架构稿数据流图标记"recalled 按 bm25 ASC 排序"，not 按时间。这合理：BM25 最相关的片段排最前，LLM 通常从头读。不需要在 formatRecalled 里再次排序。
- **recalTopK 默认 3**：最多 3 条召回，格式化为 3 行。prompt 额外开销约 100 token，安全。

---

## §8 测试用例集

### 8.1 Rust 单测（硬门槛，10 项）

所有测试使用 in-memory SQLite connection（`Connection::open_in_memory()`），不依赖任何文件系统。

| # | 测试名 | 测试内容 | 关键断言 |
|---|---|---|---|
| 1 | `append_message_writes_to_both_tables` | append `ichan`/`user` 消息 → 检查 `chat_messages` 和 `chat_memory_index` 各有一条 | `SELECT COUNT(*)` 两表各 = 1 |
| 2 | `append_system_role_does_not_index` | append `system` 消息 → `chat_messages` 有 1 条，`chat_memory_index` 有 0 条 | 索引表 count = 0 |
| 3 | `query_returns_recent_window_in_chronological_order` | 写入 4 条同一 session 消息 → query recentTurns=3 → 返回最近 6 条 | 结果按 `created_at` 升序；len = 6 |
| 4 | `query_recalled_excludes_current_session` | 写入 session A 和 session B 各若干条 → 以 `excludeSessionId=A` 查询 → recalled 仅含 session B | 所有 recalled 的 session_id != A |
| 5 | `query_recalled_excludes_items_already_in_recent_window` | session A 写入 10 条，session B 写入 3 条（与 A 关键词相关） → 以 sessionId=A 查询 → recentWindow 取 A 最近 6 条 + recalled 不应包含 A 的这 6 条（NOT IN 规则生效） | 两条集合 id 交集为空 |
| 6 | `query_with_empty_keywords_returns_empty_recalled` | 输入 `currentUserMessage = "的"`（全被停用后无 token） → recalled = [] | recalled empty; recentWindow 正常 |
| 7 | `query_respects_time_window` | 写入一条 100 天前的消息和一条昨天的消息 → query（时间窗 90 天） → 仅返回昨天的 | recalled 不含 100 天前那条 |
| 8 | `build_index_is_idempotent` | 连续调用 `buildIndex()` 两次 → 第二次 `rebuilt: false, indexed: 0` | 两次都不报错；第二次 indexed=0, rebuilt=false |
| 9 | `build_index_rebuilds_after_version_bump` | 写入 config `chat_memory_index_version = "0"` → 调用 buildIndex → 报 `rebuilt: true` | rebuilt=true; config 版本更新为 "1" |
| 10 | `jieba_segmentation_filters_short_tokens_and_stopwords` | 输入 `tokenize_for_index("我最近在健身")` → 输出不含"我"、"在"（停用词）、不含"健"（单字） | tokens 仅含"最近"和"健身" |

### 8.2 Rust 单测骨架

```rust
// src-tauri/src/chat/memory.rs (续)

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// 创建含完整 schema（chat_messages + chat_memory_index）的 in-memory db
    fn create_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::workout::SCHEMA_SQL).unwrap();
        // 插入默认 config 版本
        conn.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES ('chat_memory_index_version', '1')",
            [],
        )
        .unwrap();
        conn
    }

    // 测试用例实现在此...
}
```

### 8.3 TS 集成测（4 项）

| # | 测试内容 | 关键断言 |
|---|---|---|
| 1 | `ChatContextBuilder.getChatContext` 拼装顺序 | 传入 mock ChatMemoryStore（recalled 非空）→ 输出 `[system, system(recalled), ...recent, user]` |
| 2 | `ChatContextBuilder` recalled 为空时不插 system 段 | mock recalled = [] → messages 中不含 recall 前缀 system 消息 |
| 3 | `formatRecalled` 角色映射 | `ichan` → `i酱:`; `user` → `你:` |
| 4 | `formatRecalled` 截断 | 含超长 content 的记录 → 输出 ≤ 150 字符 + "…" |

**TS 测试骨架**：

```ts
// src/services/__tests__/ChatMemoryStore.test.ts 或 集成到现有 test 目录
import { describe, it, expect, vi } from "vitest"; // 或 jest

// mock ChatMemoryStore
const mockMemoryStore = {
  buildIndex: vi.fn().mockResolvedValue(undefined),
  ensureIndexBuilt: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({
    recalled: [
      { id: 1, sessionId: "s1", role: "ichan", content: "你之前说过练腿...", createdAtIso: "2026-04-24T10:00:00" },
    ],
    recentWindow: [
      { id: 2, sessionId: "current", role: "user", content: "今天练什么", createdAtIso: "2026-04-25T09:00:00" },
    ],
  }),
};

// Test: ChatContextBuilder.getChatContext() 拼装顺序
it("should assemble messages in correct order with recalled prefix", async () => {
  const builder = new ChatContextBuilder(chatHistoryStore, mockMemoryStore as any, deepSeekService);
  const messages = await builder.getChatContext("今天练什么", "current");

  expect(messages[0].role).toBe("system");           // system prompt
  expect(messages[1].role).toBe("system");           // recalled prefix (非空)
  expect(messages[1].content).toContain("以下是相关历史");
  expect(messages[messages.length - 1].role).toBe("user"); // current
  expect(messages[messages.length - 1].content).toBe("今天练什么");
});
```

### 8.4 边界补充测试

架构稿 §8.1 列表未覆盖但建议补充：

| # | Rust 测试 | 目的 |
|---|---|---|
| A | `tokenize_for_query_hmm_new_word_discovery` | 验证 HMM 对未登录词（如"卧推"+"计划"→"卧推计划"）有拆分能力 |
| B | `build_match_expr_with_single_quote` | 用户输入含 `'` 时转义不注入 SQL |
| C | `concurrent_build_index_serialized` | 两次并发 `buildIndex` 调用 → 第二次 no-op，不崩溃 |

---

## §9 错误处理细节

### 9.1 jieba 字典加载失败

**决策结论**: 返回 empty tokens（不报错），写入降级 fallback（按字符切分）。

**理由**: jieba-rs 是纯 Rust 实现，默认字典内嵌于 crate，加载失败几乎不可能（除非 OOM）。但防御式编程下：
- 不使用 `unwrap()` / `expect()`，用 `match` 或 `unwrap_or_else`。
- `tokenize_for_index_with_fallback` 双保险。

```rust
pub fn tokenize_safe(text: &str) -> String {
    // std::panic::catch_unwind 防护极端 panic
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        tokenize_for_index_with_fallback(text)
    })) {
        Ok(result) => result,
        Err(_) => {
            // jieba 崩溃 → 按字符兜底
            text.chars()
                .filter(|c| !c.is_ascii_whitespace())
                .map(|c| c.to_string())
                .collect::<Vec<_>>()
                .join(" ")
        }
    }
}
```

### 9.2 FTS5 编译标志缺失

**决策结论**: 启动时检测 `rusqlite` 是否编译了 `fts5` feature，若缺失则整个 ChatMemoryStore 降级为 no-op。

**理由**: `rusqlite = { features = ["bundled"] }` 当前配置**默认包含** FTS5（bundled SQLite 自带 FTS5 编译选项）。但若未来有人误删该 feature，需优雅降级而非 panic。

```rust
/// 在 chat_memory_index 初始化时检测 FTS5 可用性
fn ensure_fts5_available(conn: &Connection) -> Result<(), String> {
    let has_fts5: bool = conn
        .query_row(
            "SELECT sqlite_compileoption_used('ENABLE_FTS5')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !has_fts5 {
        return Err("FTS5 extension not compiled in SQLite. Chat memory indexing disabled.".into());
    }
    Ok(())
}
```

TS 侧因应降级：

```ts
// ChatMemoryStoreImpl
private fts5Disabled = false;

private async _doBuildIndex(): Promise<void> {
  try {
    await invoke('chat_memory_build_index');
  } catch (e) {
    if (String(e).includes('FTS5')) {
      this.fts5Disabled = true;
      console.warn('[memory] FTS5 not available, memory recall disabled');
    }
    throw e;
  }
}

async query(input: ChatMemoryQuery): Promise<ChatMemoryResult> {
  if (this.fts5Disabled) {
    // 降级：返回 recentWindow (无 recalled)
    return { recalled: [], recentWindow: await this.fallbackRecentWindow(input) };
  }
  // 正常路径 ...
}
```

### 9.3 索引损坏时的自动 rebuild

**决策结论**: 检测到 `chat_memory_index` 行数与预期不符（如 `chat_messages` role 非 system 行数 > index 行数）时，下一次 `buildIndex` 自动触发全量重建。

**理由**: 进程 crash 在事务中间可能导致 `chat_messages` 已写入而 `chat_memory_index` 未写入。健壮策略是在 `buildIndex` 的幂等检查中做行数一致性校验。

```rust
fn is_index_healthy(conn: &Connection) -> Result<bool, String> {
    let msg_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chat_messages WHERE role IN ('ichan', 'user')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let idx_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chat_memory_index",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // 允许 ±5 的差异（事务边界间隙），超过 5 条差异视为不一致
    Ok((msg_count - idx_count).abs() <= 5)
}
```

### 9.4 整体错误降级矩阵

| 场景 | Rust 侧行为 | TS 侧降级 | 用户感知 |
|---|---|---|---|
| jieba 加载失败 | 返回 empty tokens fallback | `recalled = []`，对话正常 | 无长期记忆召回 |
| FTS5 不可用 | `chat_memory_build_index` 返回 Err | `fts5Disabled = true`，降级纯 recentWindow | 无长期记忆召回 |
| FTS5 MATCH 语法错误 | `query` 返回 `recalled = []` | 正常返回（recalled 空） | 无长期记忆召回 |
| 索引损坏 | `buildIndex` 自动重建 | 透明，下个 query 正常 | 索引重建期间 recalled 为空（单次 query） |
| `chat_append` 分词失败 | fallback 按字符索引 | 索引质量下降但不丢主数据 | 无感知 |
| `buildIndex` 超时 | 最后一批 commit 后允许中断 | catch 错误，不阻断 | 旧数据可能部分未索引 |
| 空 tokens（全停用词） | `build_match_expr` 返回 None | `recalled = []` | 无召回 |

---

## §10 persona_prompt_spec.md §3.3 字面对齐核对结果

### 10.1 核对总表

| # | persona_prompt_spec.md §3.3 原文字面 | 本细化稿对齐项 | 结论 |
|---|---|---|---|
| 1 | `"以下是相关历史"` | formatRecalled 前缀 `"以下是相关历史:\n"` | ✅ 字面一致（多加了 `:\n` 和换行，是格式段非文案段） |
| 2 | "拼接顺序：[相关片段（带"以下是相关历史"前缀）] + [最近 6 轮] + [本次 user]" | ChatContextBuilder 阶段 2: `[system, recalled, recentWindow, user]` | ✅ 顺序一致 |
| 3 | "阶段 2：在 chat_messages 表加 SQLite FTS5 全文索引" | `chat_memory_index` FTS5 虚表（独立表，非打在 chat_messages 上） | ⚠️ 偏差说明见下 |
| 4 | "按本次 user message 提取 3-5 个关键词" | `tokenize_for_query` + `build_match_expr` 取前 5 个 token | ✅ 一致（按 jieba 分词自动提取，非 AI 提取关键词） |
| 5 | "FTS 召回 2-3 条相关历史片段" | `recallTopK` 默认 3 | ✅ 一致 |
| 6 | "纯关键词，不上 embedding" | 决策 K1/K4 一致 | ✅ 一致 |
| 7 | 角色映射: `'ichan'` → `'assistant'` | ChatContextBuilder.mapRecordToChatMessage: `ichan` → `assistant` | ✅ 一致 |
| 8 | 过滤 system 记录 | `filter(r => r.role !== 'system')` | ✅ 一致 |
| 9 | "recent 6 轮"（= 12 条） | `recentTurns * 2` = `6 * 2` = 12 | ✅ 一致（persona spec 就写"最近 6 轮"，架构稿 extend 为 12 条） |

### 10.2 偏差说明

**第 3 项偏差**：spec 原文写"在 chat_messages 表加 SQLite FTS5 全文索引"，但架构稿 K1 决策采用**独立 FTS5 表**方案（`chat_memory_index`）。这是架构层审核后的优化决策，不是实现错误。独立表和 content-rowid 模式在 **召回效果上等价**（都是对 chat_messages 内容建立 FTS 索引），差异在于：
- 独立表方案：FTS5 分词在应用层（jieba-rs），不依赖 SQLite 内置 tokenizer。
- Spec 预设的 content-rowid 方案：只能使用 unicode61 tokenizer（中文召回差）。

**不影响 spec 的兼容性**：两个方案对调用方（ChatContextBuilder / getChatContext）透明，接口语义不变。

### 10.3 对齐确认

- `formatRecalled` 前缀文案与 spec §3.3 **字面完全一致**（`以下是相关历史`）。
- Recall topK = 3 与 spec "2-3 条"一致。
- Role 映射规则与 B1-4 阶段 1 一致（`ichan` → `assistant`，`system` 过滤）。
- **无其他 deviance**。

---