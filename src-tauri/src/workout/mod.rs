use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use chrono::{Local, NaiveDate, NaiveDateTime};
use csv::{ReaderBuilder, StringRecord};
use encoding_rs::GB18030;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub sessions_added: i64,
    pub sets_added: i64,
    pub duplicates_skipped: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutCsvImportOutput {
    pub result: ImportResult,
    pub last_csv_import_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseSummary {
    pub title: String,
    pub top_set_weight: Option<f64>,
    pub top_set_reps: Option<i64>,
    pub total_sets: i64,
    #[serde(rename = "avgRPE")]
    pub avg_rpe: Option<f64>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutSummary {
    pub session_title: String,
    pub date: String,
    pub duration_minutes: i64,
    pub exercises: Vec<ExerciseSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyPartRecency {
    pub body_part: String,
    pub last_date: String,
    pub days_since: i64,
}

#[derive(Debug, Clone)]
struct ParsedSet {
    exercise_title: String,
    exercise_notes: String,
    set_index: i64,
    set_type: String,
    weight_kg: Option<f64>,
    reps: Option<i64>,
    distance_km: Option<f64>,
    duration_seconds: Option<i64>,
    rpe: Option<f64>,
}

#[derive(Debug, Clone)]
struct ParsedSession {
    title: String,
    start_time: String,
    end_time: String,
    description: String,
    sets: Vec<ParsedSet>,
}

pub(crate) const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  description TEXT,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id),
  exercise_title TEXT NOT NULL,
  exercise_notes TEXT,
  set_index INTEGER NOT NULL,
  set_type TEXT NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  distance_km REAL,
  duration_seconds INTEGER,
  rpe REAL
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON workout_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sets_session ON workout_sets(session_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_title);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_start_title ON workout_sessions(start_time, title);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ichan', 'user', 'system')),
  content TEXT NOT NULL,
  created_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recent ON chat_messages(id DESC);
"#;

#[tauri::command]
pub fn workout_import_csv(app: AppHandle, file_path: String) -> WorkoutCsvImportOutput {
    match do_import_csv(&app, &file_path) {
        Ok(output) => output,
        Err(err) => WorkoutCsvImportOutput {
            result: ImportResult {
                sessions_added: 0,
                sets_added: 0,
                duplicates_skipped: 0,
                error: Some(err),
            },
            last_csv_import_date: None,
        },
    }
}

#[tauri::command]
pub fn workout_get_last_workout(app: AppHandle) -> Option<WorkoutSummary> {
    do_get_last_workout(&app).unwrap_or(None)
}

#[tauri::command]
pub fn workout_get_body_part_recency(app: AppHandle) -> Vec<BodyPartRecency> {
    do_get_body_part_recency(&app).unwrap_or_else(|_| Vec::new())
}

fn do_import_csv(app: &AppHandle, file_path: &str) -> Result<WorkoutCsvImportOutput, String> {
    let csv_text = read_csv_with_fallback(file_path)?;
    let parsed_sessions = parse_csv_sessions(&csv_text)?;
    if parsed_sessions.is_empty() {
        return Ok(WorkoutCsvImportOutput {
            result: ImportResult {
                sessions_added: 0,
                sets_added: 0,
                duplicates_skipped: 0,
                error: Some("CSV is empty or contains no valid rows.".to_string()),
            },
            last_csv_import_date: None,
        });
    }

    let mut conn = open_workout_db(app)?;
    ensure_schema(&conn)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to open transaction: {e}"))?;
    let (sessions_added, sets_added, duplicates_skipped) = write_sessions(&tx, &parsed_sessions)?;
    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {e}"))?;

    let last_csv_import_date = if sessions_added > 0 {
        Some(Local::now().date_naive().format("%Y-%m-%d").to_string())
    } else {
        None
    };

    Ok(WorkoutCsvImportOutput {
        result: ImportResult {
            sessions_added,
            sets_added,
            duplicates_skipped,
            error: None,
        },
        last_csv_import_date,
    })
}

fn do_get_last_workout(app: &AppHandle) -> Result<Option<WorkoutSummary>, String> {
    let conn = open_workout_db(app)?;
    ensure_schema(&conn)?;
    get_last_workout_from_conn(&conn)
}

fn get_last_workout_from_conn(conn: &Connection) -> Result<Option<WorkoutSummary>, String> {
    let session_row = conn
        .query_row(
            r#"
            SELECT id, title, start_time, end_time
            FROM workout_sessions
            ORDER BY start_time DESC, id DESC
            LIMIT 1
            "#,
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Failed to query latest workout: {e}"))?;

    let Some((session_id, session_title, start_time, end_time)) = session_row else {
        return Ok(None);
    };

    let duration_minutes = compute_duration_minutes(&start_time, &end_time);
    let date = start_time.split('T').next().unwrap_or("").to_string();

    let mut stmt = conn
        .prepare(
            r#"
            SELECT exercise_title, COALESCE(exercise_notes, ''), set_type, weight_kg, reps, rpe
            FROM workout_sets
            WHERE session_id = ?
            ORDER BY exercise_title ASC, set_index ASC, id ASC
            "#,
        )
        .map_err(|e| format!("Failed to prepare exercise query: {e}"))?;

    let mut rows = stmt
        .query(params![session_id])
        .map_err(|e| format!("Failed to query exercise rows: {e}"))?;

    #[derive(Debug)]
    struct ExerciseAgg {
        top_set_weight: Option<f64>,
        top_set_reps: Option<i64>,
        total_sets: i64,
        rpe_sum: f64,
        rpe_count: i64,
        notes: String,
    }

    let mut exercises: HashMap<String, ExerciseAgg> = HashMap::new();

    while let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to iterate exercise rows: {e}"))?
    {
        let title: String = row.get(0).unwrap_or_default();
        let notes: String = row.get(1).unwrap_or_default();
        let set_type: String = row.get(2).unwrap_or_default();
        let weight_kg: Option<f64> = row.get(3).ok().flatten();
        let reps: Option<i64> = row.get(4).ok().flatten();
        let rpe: Option<f64> = row.get(5).ok().flatten();

        let entry = exercises.entry(title).or_insert(ExerciseAgg {
            top_set_weight: None,
            top_set_reps: None,
            total_sets: 0,
            rpe_sum: 0.0,
            rpe_count: 0,
            notes: String::new(),
        });

        if !notes.is_empty() && entry.notes.is_empty() {
            entry.notes = notes;
        }

        if set_type.to_ascii_lowercase() != "warmup" {
            entry.total_sets += 1;
        }

        if let Some(v) = rpe {
            entry.rpe_sum += v;
            entry.rpe_count += 1;
        }

        match (entry.top_set_weight, weight_kg) {
            (None, Some(w)) => {
                entry.top_set_weight = Some(w);
                entry.top_set_reps = reps;
            }
            (Some(curr), Some(w)) if w > curr => {
                entry.top_set_weight = Some(w);
                entry.top_set_reps = reps;
            }
            _ => {}
        }
    }

    let mut exercise_summaries: Vec<ExerciseSummary> = exercises
        .into_iter()
        .map(|(title, agg)| ExerciseSummary {
            title,
            top_set_weight: agg.top_set_weight,
            top_set_reps: agg.top_set_reps,
            total_sets: agg.total_sets,
            avg_rpe: if agg.rpe_count > 0 {
                Some(agg.rpe_sum / agg.rpe_count as f64)
            } else {
                None
            },
            notes: agg.notes,
        })
        .collect();
    exercise_summaries.sort_by(|a, b| a.title.cmp(&b.title));

    Ok(Some(WorkoutSummary {
        session_title,
        date,
        duration_minutes,
        exercises: exercise_summaries,
    }))
}

fn do_get_body_part_recency(app: &AppHandle) -> Result<Vec<BodyPartRecency>, String> {
    let conn = open_workout_db(app)?;
    ensure_schema(&conn)?;
    get_body_part_recency_from_conn(&conn)
}

fn get_body_part_recency_from_conn(conn: &Connection) -> Result<Vec<BodyPartRecency>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT title, start_time
            FROM workout_sessions
            ORDER BY start_time DESC
            "#,
        )
        .map_err(|e| format!("Failed to prepare recency query: {e}"))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| format!("Failed to run recency query: {e}"))?;

    let mut latest_by_part: HashMap<String, NaiveDate> = HashMap::new();
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to iterate recency rows: {e}"))?
    {
        let title: String = row.get(0).unwrap_or_default();
        let start_time: String = row.get(1).unwrap_or_default();
        if let Ok(dt) = parse_datetime_to_naive(&start_time) {
            let body_part = infer_body_part(&title);
            latest_by_part
                .entry(body_part)
                .and_modify(|d| {
                    if dt.date() > *d {
                        *d = dt.date();
                    }
                })
                .or_insert(dt.date());
        }
    }

    let today = Local::now().date_naive();
    let mut out: Vec<BodyPartRecency> = latest_by_part
        .into_iter()
        .map(|(body_part, last_date)| {
            let days_since = (today - last_date).num_days().max(0);
            BodyPartRecency {
                body_part,
                last_date: last_date.format("%Y-%m-%d").to_string(),
                days_since,
            }
        })
        .collect();
    out.sort_by(|a, b| {
        a.days_since
            .cmp(&b.days_since)
            .then(a.body_part.cmp(&b.body_part))
    });
    Ok(out)
}

fn write_sessions(
    tx: &Transaction<'_>,
    sessions: &[ParsedSession],
) -> Result<(i64, i64, i64), String> {
    let mut sessions_added = 0_i64;
    let mut sets_added = 0_i64;
    let mut duplicates_skipped = 0_i64;
    let imported_at = Local::now()
        .naive_local()
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    for session in sessions {
        let existing_id: Option<i64> = tx
            .query_row(
                "SELECT id FROM workout_sessions WHERE start_time = ? AND title = ? LIMIT 1",
                params![session.start_time, session.title],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to check duplicate session: {e}"))?;

        if existing_id.is_some() {
            duplicates_skipped += 1;
            continue;
        }

        tx.execute(
            r#"
            INSERT INTO workout_sessions(title, start_time, end_time, description, imported_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
            params![
                session.title,
                session.start_time,
                session.end_time,
                session.description,
                imported_at
            ],
        )
        .map_err(|e| format!("Failed to insert workout session: {e}"))?;
        let session_id = tx.last_insert_rowid();
        sessions_added += 1;

        for set in &session.sets {
            tx.execute(
                r#"
                INSERT INTO workout_sets(
                  session_id,
                  exercise_title,
                  exercise_notes,
                  set_index,
                  set_type,
                  weight_kg,
                  reps,
                  distance_km,
                  duration_seconds,
                  rpe
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
                params![
                    session_id,
                    set.exercise_title,
                    set.exercise_notes,
                    set.set_index,
                    set.set_type,
                    set.weight_kg,
                    set.reps,
                    set.distance_km,
                    set.duration_seconds,
                    set.rpe
                ],
            )
            .map_err(|e| format!("Failed to insert workout set: {e}"))?;
            sets_added += 1;
        }
    }

    Ok((sessions_added, sets_added, duplicates_skipped))
}

fn parse_csv_sessions(csv_text: &str) -> Result<Vec<ParsedSession>, String> {
    let mut reader = ReaderBuilder::new()
        .has_headers(true)
        .trim(csv::Trim::All)
        .flexible(true)
        .from_reader(csv_text.as_bytes());
    let headers = reader
        .headers()
        .map_err(|e| format!("Invalid CSV header: {e}"))?
        .clone();

    let mut sessions: HashMap<(String, String), ParsedSession> = HashMap::new();
    let mut row_count = 0usize;
    for (idx, record) in reader.records().enumerate() {
        let record = record.map_err(|e| format!("Failed to parse CSV row {}: {e}", idx + 2))?;
        if record.iter().all(|v| v.trim().is_empty()) {
            continue;
        }
        row_count += 1;
        let row = CsvRow::new(&headers, &record);

        let title = row.required(&["title"], idx + 2)?;
        let start_time_raw = row.required(&["start_time", "start time"], idx + 2)?;
        let end_time_raw = row.required(&["end_time", "end time"], idx + 2)?;
        let start_time = parse_datetime_to_iso(&start_time_raw)?;
        let end_time = parse_datetime_to_iso(&end_time_raw)?;
        let description = row.optional(&["description"]).unwrap_or_default();

        let exercise_title = row.required(&["exercise_title", "exercise title"], idx + 2)?;
        let exercise_notes = row
            .optional(&["exercise_notes", "exercise notes"])
            .unwrap_or_default();
        let set_index = parse_i64(
            &row.required(&["set_index", "set index"], idx + 2)?,
            "set_index",
            idx + 2,
        )?;
        let set_type = row.required(&["set_type", "set type"], idx + 2)?;
        let weight_kg = parse_optional_f64(row.optional(&["weight_kg", "weight kg"]).as_deref())?;
        let reps = parse_optional_i64(row.optional(&["reps"]).as_deref())?;
        let distance_km =
            parse_optional_f64(row.optional(&["distance_km", "distance km"]).as_deref())?;
        let duration_seconds = parse_optional_i64(
            row.optional(&["duration_seconds", "duration seconds"])
                .as_deref(),
        )?;
        let rpe = parse_optional_f64(row.optional(&["rpe"]).as_deref())?;

        let set = ParsedSet {
            exercise_title,
            exercise_notes,
            set_index,
            set_type,
            weight_kg,
            reps,
            distance_km,
            duration_seconds,
            rpe,
        };

        let key = (start_time.clone(), title.clone());
        sessions
            .entry(key)
            .and_modify(|existing| existing.sets.push(set.clone()))
            .or_insert(ParsedSession {
                title,
                start_time,
                end_time,
                description,
                sets: vec![set],
            });
    }

    if row_count == 0 {
        return Ok(Vec::new());
    }

    let mut out: Vec<ParsedSession> = sessions.into_values().collect();
    out.sort_by(|a, b| a.start_time.cmp(&b.start_time).then(a.title.cmp(&b.title)));
    Ok(out)
}

fn read_csv_with_fallback(file_path: &str) -> Result<String, String> {
    let bytes =
        fs::read(file_path).map_err(|e| format!("Failed to read file '{file_path}': {e}"))?;
    if bytes.is_empty() {
        return Ok(String::new());
    }
    match String::from_utf8(bytes.clone()) {
        Ok(utf8) => Ok(strip_bom(utf8)),
        Err(_) => {
            let (decoded, _, _) = GB18030.decode(&bytes);
            Ok(strip_bom(decoded.into_owned()))
        }
    }
}

fn strip_bom(mut text: String) -> String {
    if text.starts_with('\u{feff}') {
        text.remove(0);
    }
    text
}

fn parse_datetime_to_iso(raw: &str) -> Result<String, String> {
    let dt = parse_datetime_to_naive(raw)?;
    Ok(dt.format("%Y-%m-%dT%H:%M:%S").to_string())
}

fn parse_datetime_to_naive(raw: &str) -> Result<NaiveDateTime, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err("Datetime field is empty.".to_string());
    }
    const FORMATS: [&str; 4] = [
        "%d %b %Y, %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ];
    for fmt in FORMATS {
        if let Ok(v) = NaiveDateTime::parse_from_str(value, fmt) {
            return Ok(v);
        }
    }
    Err(format!("Unsupported datetime format: '{value}'"))
}

fn parse_i64(raw: &str, field: &str, row: usize) -> Result<i64, String> {
    raw.trim()
        .parse::<i64>()
        .map_err(|_| format!("Invalid {field} at row {row}: '{raw}'"))
}

fn parse_optional_i64(raw: Option<&str>) -> Result<Option<i64>, String> {
    let Some(v) = raw else {
        return Ok(None);
    };
    let t = v.trim();
    if t.is_empty() {
        return Ok(None);
    }
    t.parse::<i64>()
        .map(Some)
        .map_err(|_| format!("Invalid integer value: '{v}'"))
}

fn parse_optional_f64(raw: Option<&str>) -> Result<Option<f64>, String> {
    let Some(v) = raw else {
        return Ok(None);
    };
    let t = v.trim();
    if t.is_empty() {
        return Ok(None);
    }
    let normalized = t.replace(',', ".");
    normalized
        .parse::<f64>()
        .map(Some)
        .map_err(|_| format!("Invalid decimal value: '{v}'"))
}

fn compute_duration_minutes(start_iso: &str, end_iso: &str) -> i64 {
    let start = parse_datetime_to_naive(start_iso);
    let end = parse_datetime_to_naive(end_iso);
    match (start, end) {
        (Ok(s), Ok(e)) => (e - s).num_minutes().max(0),
        _ => 0,
    }
}

fn infer_body_part(title: &str) -> String {
    let v = title.to_lowercase();
    if v.contains('\u{817F}') || v.contains('\u{81C0}') || v.contains("leg") || v.contains("glute")
    {
        return "\u{817F}".to_string();
    }
    if v.contains('\u{80CC}') || v.contains("back") || v.contains("pull") {
        return "\u{80CC}".to_string();
    }
    if v.contains('\u{80F8}')
        || v.contains('\u{80A9}')
        || v.contains("chest")
        || v.contains("shoulder")
        || v.contains("push")
    {
        return "\u{80F8}\u{80A9}".to_string();
    }
    if v.contains("arm") || v.contains('\u{81C2}') {
        return "\u{624B}\u{81C2}".to_string();
    }
    "\u{5176}\u{4ED6}".to_string()
}

fn normalize_header(input: &str) -> String {
    input
        .trim_start_matches('\u{feff}')
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '_' && *c != '-')
        .flat_map(|c| c.to_lowercase())
        .collect::<String>()
}

struct CsvRow<'a> {
    headers: &'a StringRecord,
    values: &'a StringRecord,
}

impl<'a> CsvRow<'a> {
    fn new(headers: &'a StringRecord, values: &'a StringRecord) -> Self {
        Self { headers, values }
    }

    fn optional(&self, aliases: &[&str]) -> Option<String> {
        self.find_value(aliases).map(|v| v.trim().to_string())
    }

    fn required(&self, aliases: &[&str], row: usize) -> Result<String, String> {
        let Some(value) = self.find_value(aliases) else {
            return Err(format!(
                "Missing required column value at row {row}: {}",
                aliases.join(" / ")
            ));
        };
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(format!(
                "Empty required column value at row {row}: {}",
                aliases.join(" / ")
            ));
        }
        Ok(trimmed.to_string())
    }

    fn find_value(&self, aliases: &[&str]) -> Option<&str> {
        let normalized_aliases: Vec<String> = aliases.iter().map(|a| normalize_header(a)).collect();
        for (idx, header) in self.headers.iter().enumerate() {
            let normalized = normalize_header(header);
            if normalized_aliases.iter().any(|a| a == &normalized) {
                return self.values.get(idx);
            }
        }
        None
    }
}

fn open_workout_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = workout_db_path(app)?;
    Connection::open(&db_path).map_err(|e| {
        format!(
            "Failed to open workout sqlite db '{}': {e}",
            db_path.display()
        )
    })
}

fn workout_db_path(app: &AppHandle) -> Result<PathBuf, String> {
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
        .map_err(|e| format!("Failed to initialize workout schema: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_csv() -> String {
        let mut rows = vec![
            "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe".to_string(),
        ];

        // 11 sessions, 1 set per session
        for i in 0..11 {
            let day = i + 1;
            let session_title = match i % 3 {
                0 => "Chest Shoulder",
                1 => "Back Day",
                _ => "Leg Day",
            };
            rows.push(format!(
                "{},\"{:02} Apr 2026, 12:29\",\"{:02} Apr 2026, 13:20\",good day,Bench Press,,paused,0,normal,{},8,,,{}",
                session_title,
                day,
                day,
                60 + i,
                8.0 + (i as f64 * 0.2),
            ));
        }
        rows.join("\n")
    }

    #[test]
    fn parse_csv_collects_sessions_and_sets() {
        let sessions = parse_csv_sessions(&sample_csv()).expect("csv parse should succeed");
        assert_eq!(sessions.len(), 11);
        let total_sets: usize = sessions.iter().map(|s| s.sets.len()).sum();
        assert_eq!(total_sets, 11);
    }

    #[test]
    fn import_dedup_skips_existing_sessions() {
        let sessions = parse_csv_sessions(&sample_csv()).expect("csv parse should succeed");
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        ensure_schema(&conn).expect("schema should initialize");

        let tx1 = conn.transaction().expect("tx1 should open");
        let (sessions_added_1, sets_added_1, duplicates_1) =
            write_sessions(&tx1, &sessions).expect("first import should succeed");
        tx1.commit().expect("tx1 commit should succeed");

        let tx2 = conn.transaction().expect("tx2 should open");
        let (sessions_added_2, sets_added_2, duplicates_2) =
            write_sessions(&tx2, &sessions).expect("second import should succeed");
        tx2.commit().expect("tx2 commit should succeed");

        assert_eq!(sessions_added_1, 11);
        assert_eq!(sets_added_1, 11);
        assert_eq!(duplicates_1, 0);
        assert_eq!(sessions_added_2, 0);
        assert_eq!(sets_added_2, 0);
        assert_eq!(duplicates_2, 11);

        let session_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workout_sessions", [], |r| r.get(0))
            .expect("session count should query");
        let set_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workout_sets", [], |r| r.get(0))
            .expect("set count should query");
        assert_eq!(session_count, 11);
        assert_eq!(set_count, 11);
    }

    #[test]
    fn parse_empty_or_invalid_csv_returns_error_or_empty() {
        let empty = "title,start_time,end_time,exercise_title,set_index,set_type\n";
        let empty_sessions = parse_csv_sessions(empty).expect("empty csv should parse");
        assert!(empty_sessions.is_empty());

        let invalid = "title,start_time,end_time,exercise_title,set_index,set_type\nChest Shoulder,xxx,\"14 Apr 2026, 13:20\",Bench,0,normal";
        let invalid_result = parse_csv_sessions(invalid);
        assert!(invalid_result.is_err());
    }

    #[test]
    fn helper_outputs_expected_values() {
        assert_eq!(infer_body_part("Chest Shoulder"), "\u{80F8}\u{80A9}");
        assert_eq!(infer_body_part("Leg Day"), "\u{817F}");
        assert_eq!(
            compute_duration_minutes("2026-04-14T12:29:00", "2026-04-14T13:29:00"),
            60
        );
    }

    #[test]
    fn latest_workout_and_recency_queries_work() {
        let sessions = parse_csv_sessions(&sample_csv()).expect("csv parse should succeed");
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        ensure_schema(&conn).expect("schema should initialize");

        let tx = conn.transaction().expect("tx should open");
        write_sessions(&tx, &sessions).expect("import should succeed");
        tx.commit().expect("commit should succeed");

        let latest = get_last_workout_from_conn(&conn)
            .expect("latest workout query should succeed")
            .expect("latest workout should exist");
        assert_eq!(latest.session_title, "Back Day");
        assert_eq!(latest.date, "2026-04-11");

        let recency = get_body_part_recency_from_conn(&conn).expect("recency query should succeed");
        assert!(recency.iter().any(|r| r.body_part == "\u{80CC}"));
        assert!(recency.iter().any(|r| r.body_part == "\u{80F8}\u{80A9}"));
        assert!(recency.iter().any(|r| r.body_part == "\u{817F}"));
    }
}
