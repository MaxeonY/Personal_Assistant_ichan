use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};

const CONFIG_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);
"#;

#[tauri::command]
pub fn config_get_value(app: AppHandle, key: String) -> Result<Option<String>, String> {
    config_get_value_internal(&app, &key)
}

#[tauri::command]
pub fn config_set_value(app: AppHandle, key: String, value: String) -> Result<(), String> {
    config_set_value_internal(&app, &key, &value)
}

pub(crate) fn ensure_config_schema_for_app(app: &AppHandle) -> Result<(), String> {
    let conn = open_config_db(app)?;
    ensure_config_schema(&conn)
}

pub(crate) fn config_get_value_internal(
    app: &AppHandle,
    key: &str,
) -> Result<Option<String>, String> {
    let conn = open_config_db(app)?;
    ensure_config_schema(&conn)?;
    conn.query_row(
        "SELECT value FROM config WHERE key = ?1 LIMIT 1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("Failed to read config value: {e}"))
}

pub(crate) fn config_set_value_internal(
    app: &AppHandle,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let conn = open_config_db(app)?;
    ensure_config_schema(&conn)?;
    conn.execute(
        r#"
        INSERT INTO config(key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        "#,
        params![key, value],
    )
    .map_err(|e| format!("Failed to write config value: {e}"))?;
    Ok(())
}

fn open_config_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = config_db_path(app)?;
    Connection::open(&db_path).map_err(|e| {
        format!(
            "Failed to open config sqlite db '{}': {e}",
            db_path.display()
        )
    })
}

fn config_db_path(app: &AppHandle) -> Result<PathBuf, String> {
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
    Ok(app_data.join("app.sqlite"))
}

fn ensure_config_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(CONFIG_SCHEMA_SQL)
        .map_err(|e| format!("Failed to initialize config schema: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_table_schema_creates_successfully() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        ensure_config_schema(&conn).expect("schema should initialize");
        conn.execute(
            "INSERT INTO config(key, value) VALUES ('notionToken', 'abc')",
            [],
        )
        .expect("insert should succeed");
        let value: String = conn
            .query_row(
                "SELECT value FROM config WHERE key = 'notionToken'",
                [],
                |r| r.get(0),
            )
            .expect("query should succeed");
        assert_eq!(value, "abc");
    }
}
