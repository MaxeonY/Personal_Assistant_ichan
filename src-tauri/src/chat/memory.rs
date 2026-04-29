use std::sync::OnceLock;

use chrono::{Duration, Utc};
use jieba_rs::Jieba;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::ChatMessageRecord;

pub const RECALL_TIME_WINDOW_DAYS: i64 = 90;
pub const MIN_TOKEN_LENGTH: usize = 2;
pub const MAX_MATCH_TOKENS: usize = 5;
pub const BUILD_INDEX_BATCH_SIZE: i64 = 500;
pub const CHAT_MEMORY_INDEX_VERSION: &str = "1";
const CHAT_MEMORY_INDEX_VERSION_KEY: &str = "chat_memory_index_version";

const STOPWORDS: &[&str] = &[
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上",
    "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这",
    "the", "a", "an", "is", "are", "was", "were", "of", "in", "to",
];

const CONFIG_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);
"#;

const CHAT_MEMORY_INDEX_SQL: &str = r#"
CREATE VIRTUAL TABLE IF NOT EXISTS chat_memory_index USING fts5(
    message_id UNINDEXED,
    session_id UNINDEXED,
    role UNINDEXED,
    created_at UNINDEXED,
    tokens,
    tokenize = 'unicode61 remove_diacritics 0'
);
"#;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMemoryQueryInput {
    pub current_user_message: String,
    pub recent_turns: i64,
    pub recall_top_k: i64,
    pub exclude_session_id: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMemoryResult {
    pub recalled: Vec<ChatMessageRecord>,
    pub recent_window: Vec<ChatMessageRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMemoryBuildIndexResult {
    pub rebuilt: bool,
    pub indexed: u32,
}

pub fn ensure_memory_schema(conn: &Connection) -> Result<(), String> {
    ensure_fts5_available(conn)?;
    conn.execute_batch(CONFIG_TABLE_SQL)
        .map_err(|e| format!("Failed to initialize memory config table: {e}"))?;
    conn.execute_batch(CHAT_MEMORY_INDEX_SQL)
        .map_err(|e| format!("Failed to initialize chat memory index: {e}"))?;
    Ok(())
}

pub fn ensure_fts5_available(conn: &Connection) -> Result<(), String> {
    let enabled: i64 = conn
        .query_row(
            "SELECT sqlite_compileoption_used('ENABLE_FTS5')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to detect FTS5 compile option: {e}"))?;
    if enabled == 1 {
        Ok(())
    } else {
        Err("FTS5 extension is not available in current SQLite build".to_string())
    }
}

fn jieba() -> &'static Jieba {
    static JIEBA: OnceLock<Jieba> = OnceLock::new();
    JIEBA.get_or_init(Jieba::new)
}

fn tokenize(text: &str, allow_fallback: bool) -> Vec<String> {
    let mut tokens: Vec<String> = jieba()
        .cut_for_search(text, true)
        .iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .filter(|t| t.chars().count() >= MIN_TOKEN_LENGTH)
        .filter(|t| !STOPWORDS.contains(t))
        .map(|t| t.to_string())
        .collect();

    if tokens.is_empty() && allow_fallback {
        tokens = text
            .split_whitespace()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .filter(|t| t.chars().count() >= MIN_TOKEN_LENGTH)
            .filter(|t| !STOPWORDS.contains(t))
            .map(|t| t.to_string())
            .collect();
    }

    tokens
}

pub fn tokenize_for_index_with_fallback(text: &str) -> String {
    tokenize(text, true).join(" ")
}

pub fn tokenize_for_query(text: &str) -> Vec<String> {
    tokenize(text, false)
}

pub fn build_match_expr(query_tokens: &[String]) -> Option<String> {
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

pub fn should_index_role(role: &str) -> bool {
    role == "ichan" || role == "user"
}

pub fn insert_memory_index_row(
    tx: &rusqlite::Transaction<'_>,
    message_id: i64,
    session_id: &str,
    role: &str,
    created_at_iso: &str,
    content: &str,
) -> Result<(), String> {
    let tokens = tokenize_for_index_with_fallback(content);
    tx.execute(
        r#"
        INSERT INTO chat_memory_index(message_id, session_id, role, created_at, tokens)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![message_id, session_id, role, created_at_iso, tokens],
    )
    .map_err(|e| format!("Failed to insert chat memory index row: {e}"))?;
    Ok(())
}

pub fn chat_memory_build_index(conn: &mut Connection) -> Result<ChatMemoryBuildIndexResult, String> {
    ensure_memory_schema(conn)?;

    let current_version = get_index_version(conn)?;
    let index_exists = has_chat_memory_index(conn)?;
    let index_healthy = if index_exists {
        is_index_healthy(conn)?
    } else {
        false
    };

    if current_version.as_deref() == Some(CHAT_MEMORY_INDEX_VERSION) && index_healthy {
        return Ok(ChatMemoryBuildIndexResult {
            rebuilt: false,
            indexed: 0,
        });
    }

    conn.execute("DELETE FROM chat_memory_index", [])
        .map_err(|e| format!("Failed to clear chat memory index: {e}"))?;

    let mut last_id = 0_i64;
    let mut total_indexed = 0_u32;

    loop {
        let batch = load_index_source_batch(conn, last_id, BUILD_INDEX_BATCH_SIZE)?;
        if batch.is_empty() {
            break;
        }

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to open rebuild batch transaction: {e}"))?;

        for row in &batch {
            let Some(message_id) = row.id else {
                continue;
            };
            insert_memory_index_row(
                &tx,
                message_id,
                &row.session_id,
                &row.role,
                &row.created_at_iso,
                &row.content,
            )?;
            total_indexed = total_indexed.saturating_add(1);
            last_id = message_id;
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit rebuild batch transaction: {e}"))?;
    }

    set_index_version(conn, CHAT_MEMORY_INDEX_VERSION)?;

    Ok(ChatMemoryBuildIndexResult {
        rebuilt: true,
        indexed: total_indexed,
    })
}

pub fn chat_memory_query(
    conn: &Connection,
    input: ChatMemoryQueryInput,
) -> Result<ChatMemoryResult, String> {
    ensure_memory_schema(conn)?;

    let recent_turns = input.recent_turns.max(0);
    let recall_top_k = input.recall_top_k.max(0);

    let recent_window = list_recent_window(conn, input.session_id.as_deref(), recent_turns)?;
    if recall_top_k == 0 {
        return Ok(ChatMemoryResult {
            recalled: Vec::new(),
            recent_window,
        });
    }

    let query_tokens = tokenize_for_query(&input.current_user_message);
    let Some(match_expr) = build_match_expr(&query_tokens) else {
        return Ok(ChatMemoryResult {
            recalled: Vec::new(),
            recent_window,
        });
    };

    let min_created_at = (Utc::now() - Duration::days(RECALL_TIME_WINDOW_DAYS))
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    let recent_ids: Vec<i64> = recent_window.iter().filter_map(|m| m.id).collect();
    let raw_limit = recall_top_k
        .saturating_add(i64::try_from(recent_ids.len()).unwrap_or(0))
        .max(recall_top_k);

    let mut stmt = conn
        .prepare(
            r#"
            SELECT m.id, m.session_id, m.role, m.content, m.created_at_iso
            FROM chat_messages m
            JOIN chat_memory_index idx ON idx.message_id = m.id
            WHERE chat_memory_index MATCH ?1
              AND (?2 IS NULL OR idx.session_id != ?2)
              AND idx.created_at >= ?3
            ORDER BY bm25(chat_memory_index) ASC
            LIMIT ?4
            "#,
        )
        .map_err(|e| format!("Failed to prepare chat memory query: {e}"))?;

    let rows = stmt
        .query_map(
            params![match_expr, input.exclude_session_id, min_created_at, raw_limit],
            map_chat_message_row,
        )
        .map_err(|e| format!("Failed to execute chat memory query: {e}"))?;

    let candidates: Result<Vec<ChatMessageRecord>, rusqlite::Error> = rows.collect();
    let candidates = candidates.map_err(|e| format!("Failed to map memory query rows: {e}"))?;

    let mut recalled = Vec::new();
    for record in candidates {
        let Some(id) = record.id else {
            continue;
        };
        if recent_ids.contains(&id) {
            continue;
        }
        recalled.push(record);
        if i64::try_from(recalled.len()).unwrap_or(i64::MAX) >= recall_top_k {
            break;
        }
    }

    Ok(ChatMemoryResult {
        recalled,
        recent_window,
    })
}

fn list_recent_window(
    conn: &Connection,
    session_id: Option<&str>,
    recent_turns: i64,
) -> Result<Vec<ChatMessageRecord>, String> {
    let limit = recent_turns.saturating_mul(2);
    if limit <= 0 {
        return Ok(Vec::new());
    }

    let mut rows = if let Some(sid) = session_id {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, session_id, role, content, created_at_iso
                FROM chat_messages
                WHERE session_id = ?1
                ORDER BY id DESC
                LIMIT ?2
                "#,
            )
            .map_err(|e| format!("Failed to prepare session recent window query: {e}"))?;
        let mapped = stmt
            .query_map(params![sid, limit], map_chat_message_row)
            .map_err(|e| format!("Failed to execute session recent window query: {e}"))?;
        let collected: Result<Vec<ChatMessageRecord>, rusqlite::Error> = mapped.collect();
        collected.map_err(|e| format!("Failed to map session recent window rows: {e}"))?
    } else {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, session_id, role, content, created_at_iso
                FROM chat_messages
                ORDER BY id DESC
                LIMIT ?1
                "#,
            )
            .map_err(|e| format!("Failed to prepare global recent window query: {e}"))?;
        let mapped = stmt
            .query_map(params![limit], map_chat_message_row)
            .map_err(|e| format!("Failed to execute global recent window query: {e}"))?;
        let collected: Result<Vec<ChatMessageRecord>, rusqlite::Error> = mapped.collect();
        collected.map_err(|e| format!("Failed to map global recent window rows: {e}"))?
    };

    rows.reverse();
    Ok(rows)
}

fn map_chat_message_row(row: &rusqlite::Row<'_>) -> Result<ChatMessageRecord, rusqlite::Error> {
    Ok(ChatMessageRecord {
        id: Some(row.get::<_, i64>(0)?),
        session_id: row.get::<_, String>(1)?,
        role: row.get::<_, String>(2)?,
        content: row.get::<_, String>(3)?,
        created_at_iso: row.get::<_, String>(4)?,
    })
}

fn load_index_source_batch(
    conn: &Connection,
    last_id: i64,
    batch_size: i64,
) -> Result<Vec<ChatMessageRecord>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, session_id, role, content, created_at_iso
            FROM chat_messages
            WHERE role IN ('ichan', 'user')
              AND id > ?1
            ORDER BY id ASC
            LIMIT ?2
            "#,
        )
        .map_err(|e| format!("Failed to prepare index source query: {e}"))?;

    let rows = stmt
        .query_map(params![last_id, batch_size], map_chat_message_row)
        .map_err(|e| format!("Failed to query index source rows: {e}"))?;
    let out: Result<Vec<ChatMessageRecord>, rusqlite::Error> = rows.collect();
    out.map_err(|e| format!("Failed to map index source rows: {e}"))
}

fn get_index_version(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM config WHERE key = ?1 LIMIT 1",
        params![CHAT_MEMORY_INDEX_VERSION_KEY],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("Failed to read chat memory index version: {e}"))
}

fn set_index_version(conn: &Connection, version: &str) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO config(key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        "#,
        params![CHAT_MEMORY_INDEX_VERSION_KEY, version],
    )
    .map_err(|e| format!("Failed to write chat memory index version: {e}"))?;
    Ok(())
}

fn has_chat_memory_index(conn: &Connection) -> Result<bool, String> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chat_memory_index' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to check memory index existence: {e}"))?;
    Ok(found == Some(1))
}

fn is_index_healthy(conn: &Connection) -> Result<bool, String> {
    let message_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chat_messages WHERE role IN ('ichan', 'user')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count chat messages for memory health: {e}"))?;
    let index_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM chat_memory_index", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count memory index rows for health: {e}"))?;
    Ok(message_count == index_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workout::SCHEMA_SQL;

    fn create_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        conn.execute_batch(SCHEMA_SQL)
            .expect("workout/chat schema should initialize");
        ensure_memory_schema(&conn).expect("memory schema should initialize");
        conn
    }

    fn append_record(
        conn: &mut Connection,
        session_id: &str,
        role: &str,
        content: &str,
        created_at_iso: &str,
    ) -> i64 {
        conn.execute(
            r#"
            INSERT INTO chat_messages(session_id, role, content, created_at_iso)
            VALUES (?1, ?2, ?3, ?4)
            "#,
            params![session_id, role, content, created_at_iso],
        )
        .expect("insert chat message should succeed");
        let id = conn.last_insert_rowid();
        if should_index_role(role) {
            conn.execute(
                r#"
                INSERT INTO chat_memory_index(message_id, session_id, role, created_at, tokens)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                params![
                    id,
                    session_id,
                    role,
                    created_at_iso,
                    tokenize_for_index_with_fallback(content)
                ],
            )
            .expect("insert memory index row should succeed");
        }
        id
    }

    #[test]
    fn query_returns_recent_window_in_chronological_order() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "1", "2026-04-01T10:00:00");
        append_record(&mut conn, "s1", "ichan", "2", "2026-04-01T10:01:00");
        append_record(&mut conn, "s1", "user", "3", "2026-04-01T10:02:00");
        append_record(&mut conn, "s1", "ichan", "4", "2026-04-01T10:03:00");

        let result = chat_memory_query(
            &conn,
            ChatMemoryQueryInput {
                current_user_message: "测试".to_string(),
                recent_turns: 2,
                recall_top_k: 0,
                exclude_session_id: Some("s1".to_string()),
                session_id: Some("s1".to_string()),
            },
        )
        .expect("query should succeed");

        assert_eq!(result.recent_window.len(), 4);
        assert_eq!(result.recent_window[0].content, "1");
        assert_eq!(result.recent_window[3].content, "4");
    }

    #[test]
    fn query_recalled_excludes_current_session() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "健身计划", "2026-04-01T10:00:00");
        append_record(&mut conn, "s2", "user", "健身计划", "2026-04-01T10:01:00");

        let result = chat_memory_query(
            &conn,
            ChatMemoryQueryInput {
                current_user_message: "健身计划".to_string(),
                recent_turns: 1,
                recall_top_k: 3,
                exclude_session_id: Some("s1".to_string()),
                session_id: Some("s1".to_string()),
            },
        )
        .expect("query should succeed");

        assert_eq!(result.recalled.len(), 1);
        assert_eq!(result.recalled[0].session_id, "s2");
    }

    #[test]
    fn query_recalled_excludes_recent_window() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "健身计划A", "2026-04-01T10:00:00");
        append_record(&mut conn, "s1", "ichan", "健身计划B", "2026-04-01T10:01:00");
        append_record(&mut conn, "s2", "user", "健身计划C", "2026-04-01T10:02:00");

        let result = chat_memory_query(
            &conn,
            ChatMemoryQueryInput {
                current_user_message: "健身计划".to_string(),
                recent_turns: 2,
                recall_top_k: 3,
                exclude_session_id: None,
                session_id: Some("s1".to_string()),
            },
        )
        .expect("query should succeed");

        let recent_ids: Vec<i64> = result.recent_window.iter().filter_map(|m| m.id).collect();
        assert!(
            result
                .recalled
                .iter()
                .all(|m| m.id.map(|id| !recent_ids.contains(&id)).unwrap_or(true))
        );
    }

    #[test]
    fn query_with_empty_keywords_returns_empty_recalled() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "普通消息", "2026-04-01T10:00:00");

        let result = chat_memory_query(
            &conn,
            ChatMemoryQueryInput {
                current_user_message: "的 了 在".to_string(),
                recent_turns: 1,
                recall_top_k: 3,
                exclude_session_id: None,
                session_id: Some("s1".to_string()),
            },
        )
        .expect("query should succeed");

        assert!(result.recalled.is_empty());
    }

    #[test]
    fn query_respects_time_window() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "健身计划", "2025-01-01T10:00:00");
        append_record(&mut conn, "s2", "user", "健身计划", "2026-04-01T10:00:00");

        let result = chat_memory_query(
            &conn,
            ChatMemoryQueryInput {
                current_user_message: "健身计划".to_string(),
                recent_turns: 1,
                recall_top_k: 3,
                exclude_session_id: Some("s1".to_string()),
                session_id: Some("s1".to_string()),
            },
        )
        .expect("query should succeed");

        assert_eq!(result.recalled.len(), 1);
        assert_eq!(result.recalled[0].session_id, "s2");
    }

    #[test]
    fn build_index_is_idempotent() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "健身计划", "2026-04-01T10:00:00");
        conn.execute("DELETE FROM chat_memory_index", [])
            .expect("clear index should succeed");

        let first = chat_memory_build_index(&mut conn).expect("first build should succeed");
        let second = chat_memory_build_index(&mut conn).expect("second build should succeed");

        assert!(first.rebuilt);
        assert_eq!(first.indexed, 1);
        assert_eq!(
            second,
            ChatMemoryBuildIndexResult {
                rebuilt: false,
                indexed: 0
            }
        );
    }

    #[test]
    fn build_index_rebuilds_after_version_bump() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "健身计划", "2026-04-01T10:00:00");
        set_index_version(&conn, "0").expect("set old version should succeed");
        conn.execute("DELETE FROM chat_memory_index", [])
            .expect("clear index should succeed");

        let result = chat_memory_build_index(&mut conn).expect("build should succeed");
        let version = get_index_version(&conn).expect("get version should succeed");

        assert!(result.rebuilt);
        assert_eq!(version.as_deref(), Some(CHAT_MEMORY_INDEX_VERSION));
    }

    #[test]
    fn jieba_segmentation_filters_short_tokens_and_stopwords() {
        let tokens = tokenize_for_query("我 在 健身 计划 里");
        assert!(tokens.contains(&"健身".to_string()));
        assert!(tokens.contains(&"计划".to_string()));
        assert!(!tokens.contains(&"我".to_string()));
        assert!(!tokens.contains(&"在".to_string()));
    }

    #[test]
    fn build_match_expr_filters_empty_tokens() {
        let tokens = vec!["".to_string(), "  ".to_string()];
        let expr = build_match_expr(&tokens);
        assert!(expr.is_none());
    }

    #[test]
    fn build_match_expr_escapes_double_quotes() {
        let tokens = vec!["a\"b".to_string()];
        let expr = build_match_expr(&tokens).expect("expr should exist");
        assert_eq!(expr, "\"a\"\"b\"");
    }

    #[test]
    fn match_query_uses_bound_parameter_not_sql_format() {
        let mut conn = create_conn();
        append_record(&mut conn, "s1", "user", "健身计划", "2026-04-01T10:00:00");

        let raw = "\"健身\" OR \"计划\"";
        let mut stmt = conn
            .prepare(
                r#"
                SELECT COUNT(*)
                FROM chat_memory_index
                WHERE chat_memory_index MATCH ?1
                "#,
            )
            .expect("prepare should succeed");
        let count: i64 = stmt
            .query_row(params![raw], |row| row.get(0))
            .expect("query should succeed");
        assert_eq!(count, 1);
    }
}
