pub mod memory;

use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::workout::SCHEMA_SQL;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRecord {
    pub id: Option<i64>,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at_iso: String,
}

#[tauri::command]
pub fn chat_append_message(app: AppHandle, record: ChatMessageRecord) -> Result<(), String> {
    let mut conn = open_chat_db(&app)?;
    ensure_schema(&conn)?;
    append_message_to_conn(&mut conn, &record)
}

#[tauri::command]
pub fn chat_list_by_session(
    app: AppHandle,
    session_id: String,
    cursor: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<ChatMessageRecord>, String> {
    let conn = open_chat_db(&app)?;
    ensure_schema(&conn)?;
    list_by_session_from_conn(&conn, &session_id, cursor, limit)
}

#[tauri::command]
pub fn chat_list_recent(app: AppHandle, limit: i64) -> Result<Vec<ChatMessageRecord>, String> {
    let conn = open_chat_db(&app)?;
    ensure_schema(&conn)?;
    list_recent_from_conn(&conn, limit)
}

#[tauri::command]
pub fn chat_memory_build_index(app: AppHandle) -> Result<memory::ChatMemoryBuildIndexResult, String> {
    let mut conn = open_chat_db(&app)?;
    ensure_schema(&conn)?;
    memory::chat_memory_build_index(&mut conn)
}

#[tauri::command]
pub fn chat_memory_query(
    app: AppHandle,
    input: memory::ChatMemoryQueryInput,
) -> Result<memory::ChatMemoryResult, String> {
    let conn = open_chat_db(&app)?;
    ensure_schema(&conn)?;
    memory::chat_memory_query(&conn, input)
}

fn append_message_to_conn(conn: &mut Connection, record: &ChatMessageRecord) -> Result<(), String> {
    let memory_ready = match memory::ensure_memory_schema(conn) {
        Ok(()) => true,
        Err(error) if error.contains("FTS5") => false,
        Err(error) => return Err(error),
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to open chat append transaction: {e}"))?;

    tx.execute(
        r#"
        INSERT INTO chat_messages(session_id, role, content, created_at_iso)
        VALUES (?, ?, ?, ?)
        "#,
        params![
            record.session_id,
            record.role,
            record.content,
            record.created_at_iso
        ],
    )
    .map_err(|e| format!("Failed to append chat message: {e}"))?;

    let message_id = tx.last_insert_rowid();
    if memory_ready && memory::should_index_role(&record.role) {
        memory::insert_memory_index_row(
            &tx,
            message_id,
            &record.session_id,
            &record.role,
            &record.created_at_iso,
            &record.content,
        )?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit chat append transaction: {e}"))?;
    Ok(())
}

fn list_by_session_from_conn(
    conn: &Connection,
    session_id: &str,
    cursor: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<ChatMessageRecord>, String> {
    let normalized_limit = normalize_list_by_session_limit(limit);
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, session_id, role, content, created_at_iso
            FROM chat_messages
            WHERE session_id = ?1
              AND (?2 IS NULL OR id < ?2)
            ORDER BY id DESC
            LIMIT ?3
            "#,
        )
        .map_err(|e| format!("Failed to prepare chat session query: {e}"))?;

    let rows = stmt
        .query_map(
            params![session_id, cursor, normalized_limit],
            map_chat_message_row,
        )
        .map_err(|e| format!("Failed to query chat session rows: {e}"))?;

    let messages: Result<Vec<ChatMessageRecord>, rusqlite::Error> = rows.collect();
    messages.map_err(|e| format!("Failed to map chat session rows: {e}"))
}

fn list_recent_from_conn(conn: &Connection, limit: i64) -> Result<Vec<ChatMessageRecord>, String> {
    let normalized_limit = normalize_list_recent_limit(limit);
    if normalized_limit == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, session_id, role, content, created_at_iso
            FROM chat_messages
            ORDER BY id DESC
            LIMIT ?1
            "#,
        )
        .map_err(|e| format!("Failed to prepare chat recent query: {e}"))?;

    let rows = stmt
        .query_map(params![normalized_limit], map_chat_message_row)
        .map_err(|e| format!("Failed to query recent chat rows: {e}"))?;

    let messages: Result<Vec<ChatMessageRecord>, rusqlite::Error> = rows.collect();
    messages.map_err(|e| format!("Failed to map recent chat rows: {e}"))
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

fn normalize_list_by_session_limit(limit: Option<i64>) -> i64 {
    const DEFAULT_LIMIT: i64 = 20;
    const MAX_LIMIT: i64 = 200;

    match limit {
        Some(value) if value > 0 => value.min(MAX_LIMIT),
        _ => DEFAULT_LIMIT,
    }
}

fn normalize_list_recent_limit(limit: i64) -> i64 {
    const MAX_LIMIT: i64 = 200;
    if limit <= 0 {
        return 0;
    }
    limit.min(MAX_LIMIT)
}

fn open_chat_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = chat_db_path(app)?;
    Connection::open(&db_path).map_err(|e| {
        format!(
            "Failed to open shared sqlite db '{}': {e}",
            db_path.display()
        )
    })
}

fn chat_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    fs::create_dir_all(&app_data).map_err(|e| {
        format!(
            "Failed to create app data dir '{}': {e}",
            app_data.display()
        )
    })?;
    Ok(app_data.join("workout.sqlite"))
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA_SQL)
        .map_err(|e| format!("Failed to initialize shared schema: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_message(
        session_id: &str,
        role: &str,
        content: &str,
        created_at_iso: &str,
    ) -> ChatMessageRecord {
        ChatMessageRecord {
            id: None,
            session_id: session_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            created_at_iso: created_at_iso.to_string(),
        }
    }

    fn create_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        ensure_schema(&conn).expect("schema should initialize");
        memory::ensure_memory_schema(&conn).expect("memory schema should initialize");
        conn
    }

    #[test]
    fn append_and_recent_return_desc_by_id() {
        let mut conn = create_conn();
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "user", "first", "2026-04-24T10:00:00"),
        )
        .expect("append 1 should succeed");
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "ichan", "second", "2026-04-24T10:00:01"),
        )
        .expect("append 2 should succeed");
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "system", "third", "2026-04-24T10:00:02"),
        )
        .expect("append 3 should succeed");

        let rows = list_recent_from_conn(&conn, 3).expect("list recent should succeed");
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].content, "third");
        assert_eq!(rows[1].content, "second");
        assert_eq!(rows[2].content, "first");
        assert!(rows[0].id.unwrap() > rows[1].id.unwrap());
        assert!(rows[1].id.unwrap() > rows[2].id.unwrap());
    }

    #[test]
    fn list_by_session_does_not_mix_other_sessions() {
        let mut conn = create_conn();
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "user", "s1-1", "2026-04-24T10:00:00"),
        )
        .expect("append s1 should succeed");
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-002", "user", "s2-1", "2026-04-24T10:00:01"),
        )
        .expect("append s2 should succeed");
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "ichan", "s1-2", "2026-04-24T10:00:02"),
        )
        .expect("append s1 2 should succeed");

        let rows = list_by_session_from_conn(&conn, "2026-04-24-001", None, Some(20))
            .expect("list by session should succeed");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].content, "s1-2");
        assert_eq!(rows[1].content, "s1-1");
        assert!(rows.iter().all(|m| m.session_id == "2026-04-24-001"));
    }

    #[test]
    fn list_by_session_paginates_with_cursor() {
        let mut conn = create_conn();
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "user", "msg-1", "2026-04-24T10:00:00"),
        )
        .expect("append 1 should succeed");
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "user", "msg-2", "2026-04-24T10:00:01"),
        )
        .expect("append 2 should succeed");
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "user", "msg-3", "2026-04-24T10:00:02"),
        )
        .expect("append 3 should succeed");
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "user", "msg-4", "2026-04-24T10:00:03"),
        )
        .expect("append 4 should succeed");

        let first_page = list_by_session_from_conn(&conn, "2026-04-24-001", None, Some(2))
            .expect("first page should succeed");
        assert_eq!(first_page.len(), 2);
        assert_eq!(first_page[0].content, "msg-4");
        assert_eq!(first_page[1].content, "msg-3");

        let cursor = first_page[1].id.expect("cursor id should exist");
        let second_page = list_by_session_from_conn(&conn, "2026-04-24-001", Some(cursor), Some(2))
            .expect("second page should succeed");
        assert_eq!(second_page.len(), 2);
        assert_eq!(second_page[0].content, "msg-2");
        assert_eq!(second_page[1].content, "msg-1");
        assert!(second_page.iter().all(|m| m.id.unwrap() < cursor));
    }

    #[test]
    fn content_roundtrip_keeps_unicode_newline_and_quotes() {
        let mut conn = create_conn();
        let content = "你好，iChan。\nHe said: \"keep going\".";
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "ichan", content, "2026-04-24T10:00:00"),
        )
        .expect("append should succeed");

        let rows = list_recent_from_conn(&conn, 1).expect("list recent should succeed");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].content, content);
    }

    #[test]
    fn chat_and_workout_tables_coexist_in_one_db() {
        let mut conn = create_conn();

        conn.execute(
            r#"
            INSERT INTO workout_sessions(title, start_time, end_time, description, imported_at)
            VALUES ('Leg Day', '2026-04-24T09:00:00', '2026-04-24T10:00:00', '', '2026-04-24T10:00:00')
            "#,
            [],
        )
        .expect("insert workout session should succeed");

        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-001", "user", "hello", "2026-04-24T10:01:00"),
        )
        .expect("append chat should succeed");

        let workout_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workout_sessions", [], |r| r.get(0))
            .expect("count workout sessions should succeed");
        let chat_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chat_messages", [], |r| r.get(0))
            .expect("count chat messages should succeed");

        assert_eq!(workout_count, 1);
        assert_eq!(chat_count, 1);
    }

    #[test]
    fn append_message_writes_to_both_tables() {
        let mut conn = create_conn();
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-010", "user", "hello memory", "2026-04-24T10:02:00"),
        )
        .expect("append should succeed");

        let chat_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chat_messages", [], |r| r.get(0))
            .expect("chat count query should succeed");
        let idx_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chat_memory_index", [], |r| r.get(0))
            .expect("memory index count query should succeed");

        assert_eq!(chat_count, 1);
        assert_eq!(idx_count, 1);
    }

    #[test]
    fn append_system_role_does_not_index() {
        let mut conn = create_conn();
        append_message_to_conn(
            &mut conn,
            &sample_message("2026-04-24-011", "system", "policy", "2026-04-24T10:03:00"),
        )
        .expect("append should succeed");

        let chat_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chat_messages", [], |r| r.get(0))
            .expect("chat count query should succeed");
        let idx_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chat_memory_index", [], |r| r.get(0))
            .expect("memory index count query should succeed");

        assert_eq!(chat_count, 1);
        assert_eq!(idx_count, 0);
    }
}
