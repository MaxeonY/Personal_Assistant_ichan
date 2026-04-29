export type NotionServiceErrorCode =
  | "auth_failed"
  | "rate_limited"
  | "db_not_found"
  | "network"
  | "unknown";

export interface NotionServiceConfig {
  apiToken: string;
  todoDbId: string; // Todo DB = Daily Plan DB
  researchDbId: string;
}

export interface TodoItem {
  id: string;
  title: string;
  status: "done" | "in_progress" | "not_started";
  date: string;
}

export interface ResearchLog {
  id: string;
  title: string;
  date: number;
  author?: string;
  venueTier?: string;
  readingStatus?: string;
  fields?: string[];
  priority?: string;
}

export interface DailyPlan {
  date: string;
  items: { title: string; priority: "high" | "medium" | "low" }[];
  sleepNote?: number;
}

export interface TimedTodo {
  id: string;
  title: string;
  reminderTime: string;
}

export interface NotionServicePort {
  getYesterdayTodos(databaseId: string): Promise<TodoItem[]>;
  getLatestResearchLog(databaseId: string): Promise<ResearchLog | null>;
  createDailyPlan(databaseId: string, plan: DailyPlan): Promise<string>;
  getTodayTimedTodos(databaseId: string): Promise<TimedTodo[]>;
}

export class NotionServiceError extends Error {
  constructor(
    public code: NotionServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NotionServiceError";
  }
}
