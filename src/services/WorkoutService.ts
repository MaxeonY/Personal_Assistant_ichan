import { invoke } from "@tauri-apps/api/core";

export interface ImportResult {
  sessionsAdded: number;
  setsAdded: number;
  duplicatesSkipped: number;
  error?: string;
}

export interface WorkoutCsvImportOutput {
  result: ImportResult;
  lastCsvImportDate: string | null;
}

export interface ExerciseSummary {
  title: string;
  topSetWeight: number | null;
  topSetReps: number | null;
  totalSets: number;
  avgRPE: number | null;
  notes: string;
}

export interface WorkoutSummary {
  sessionTitle: string;
  date: string;
  durationMinutes: number;
  exercises: ExerciseSummary[];
}

export interface BodyPartRecency {
  bodyPart: string;
  lastDate: string;
  daysSince: number;
}

export const WORKOUT_SQLITE_SCHEMA = `
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
`.trim();

export const WORKOUT_DEDUP_STRATEGY =
  "Deduplicate by (start_time + title). Existing sessions are skipped and never overwritten.";

export class WorkoutService {
  async importCSV(filePath: string): Promise<WorkoutCsvImportOutput> {
    try {
      const output = await invoke<WorkoutCsvImportOutput>("workout_import_csv", {
        filePath,
      });
      return output;
    } catch (error) {
      return {
        result: {
          sessionsAdded: 0,
          setsAdded: 0,
          duplicatesSkipped: 0,
          error: normalizeError(error),
        },
        lastCsvImportDate: null,
      };
    }
  }

  async getLastWorkout(): Promise<WorkoutSummary | null> {
    try {
      return await invoke<WorkoutSummary | null>("workout_get_last_workout");
    } catch {
      return null;
    }
  }

  async getBodyPartRecency(): Promise<BodyPartRecency[]> {
    try {
      return await invoke<BodyPartRecency[]>("workout_get_body_part_recency");
    } catch {
      return [];
    }
  }
}

export const workoutService = new WorkoutService();

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown workout import error.";
}
