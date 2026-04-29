import {
  type DailyPlan,
  NotionServiceError,
  type NotionServicePort,
  type ResearchLog,
  type TimedTodo,
  type TodoItem,
} from "../types/notion-types";

const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_429_RETRIES = 3;

export const TODO_DB_PROPERTY = {
  title: "\u6bcf\u65e5\u5f85\u529e",
  status: "\u5b8c\u6210\u72b6\u6001",
  date: "\u65e5\u671f",
  reminderTime: "\u63d0\u9192\u65f6\u95f4",
  sleepScore: "\u7761\u7720\u8bc4\u5206",
  category: "\u5206\u7c7b",
  priority: "\u4f18\u5148\u7ea7",
} as const;

export const RESEARCH_DB_PROPERTY = {
  title: "\u8bba\u6587\u6807\u9898",
  date: "\u53d1\u8868\u5e74\u4efd",
  author: "\u4f5c\u8005\uff08\u4ec5\u4e00\u4f5c\uff09",
  venueTier: "\u671f\u520a/\u4f1a\u8bae\u7ea7\u522b",
  readingStatus: "\u9605\u8bfb\u72b6\u6001",
  fields: "\u7814\u7a76\u9886\u57df",
  priority: "\u4f18\u5148\u7ea7",
} as const;

const PLAN_ITEM_PRIORITY_TEXT: Record<DailyPlan["items"][number]["priority"], string> = {
  high: "\u9ad8",
  medium: "\u4e2d",
  low: "\u4f4e",
};

type TokenProvider = () => Promise<string>;

interface NotionServiceOptions {
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
}

interface NotionQueryResponse {
  results: NotionPage[];
}

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

interface NotionCreatePageResponse {
  id: string;
}

interface NotionBlockChildrenResponse {
  results: NotionBlock[];
  has_more?: boolean;
  next_cursor?: string | null;
}

interface NotionBlock {
  id: string;
  type: string;
  to_do?: {
    checked?: boolean;
    rich_text?: unknown[];
  };
}

interface NotionErrorResponse {
  message?: string;
}

export class NotionService implements NotionServicePort {
  private readonly tokenProvider: TokenProvider;

  private readonly fetchImpl: typeof fetch;

  constructor(options: NotionServiceOptions = {}) {
    this.tokenProvider = options.tokenProvider ?? readNotionTokenFromTauriConfig;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getYesterdayTodos(databaseId: string): Promise<TodoItem[]> {
    const targetDate = toLocalDateIso(daysFromToday(-1));
    const query: Record<string, unknown> = {
      page_size: 100,
      filter: {
        property: TODO_DB_PROPERTY.date,
        date: { equals: targetDate },
      },
      sorts: [{ property: TODO_DB_PROPERTY.date, direction: "descending" }],
    };
    const result = await this.queryDatabase(databaseId, query);
    const todosByPage = await Promise.all(
      result.results.map((page) => this.extractTodoItemsFromPage(page, targetDate)),
    );
    return todosByPage.flat();
  }

  async getLatestResearchLog(databaseId: string): Promise<ResearchLog | null> {
    const query: Record<string, unknown> = {
      page_size: 1,
      sorts: [{ property: RESEARCH_DB_PROPERTY.date, direction: "descending" }],
    };
    const result = await this.queryDatabase(databaseId, query);
    if (result.results.length === 0) {
      return null;
    }
    return this.mapResearchLog(result.results[0]);
  }

  async createDailyPlan(databaseId: string, plan: DailyPlan): Promise<string> {
    const properties: Record<string, unknown> = {
      [TODO_DB_PROPERTY.title]: {
        title: [
          {
            type: "text",
            text: { content: `${plan.date} \u8ba1\u5212` },
          },
        ],
      },
      [TODO_DB_PROPERTY.date]: {
        date: { start: plan.date },
      },
    };

    if (typeof plan.sleepNote === "number") {
      properties[TODO_DB_PROPERTY.sleepScore] = { number: plan.sleepNote };
    }

    const created = await this.notionFetchJson<NotionCreatePageResponse>(
      "/pages",
      {
        method: "POST",
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties,
        }),
      },
      databaseId,
    );

    if (plan.items.length > 0) {
      await this.appendTodoBlocks(created.id, plan.items);
    }

    return created.id;
  }

  async getTodayTimedTodos(databaseId: string): Promise<TimedTodo[]> {
    const today = toLocalDateIso(new Date());
    const query: Record<string, unknown> = {
      page_size: 100,
      filter: {
        and: [
          { property: TODO_DB_PROPERTY.date, date: { equals: today } },
          { property: TODO_DB_PROPERTY.reminderTime, date: { is_not_empty: true } },
        ],
      },
      sorts: [{ property: TODO_DB_PROPERTY.reminderTime, direction: "ascending" }],
    };

    const result = await this.queryDatabase(databaseId, query);
    return result.results
      .map((page) => this.mapTimedTodo(page))
      .filter((todo): todo is TimedTodo => todo !== null);
  }

  private async queryDatabase(
    databaseId: string,
    payload: Record<string, unknown>,
  ): Promise<NotionQueryResponse> {
    if (!databaseId.trim()) {
      throw new NotionServiceError("db_not_found", "Database ID is empty.");
    }
    return this.notionFetchJson<NotionQueryResponse>(
      `/databases/${encodeURIComponent(databaseId)}/query`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      databaseId,
    );
  }

  private async appendTodoBlocks(
    pageId: string,
    items: DailyPlan["items"],
  ): Promise<void> {
    const chunkSize = 100;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      await this.notionFetchJson(
        `/blocks/${encodeURIComponent(pageId)}/children`,
        {
          method: "PATCH",
          body: JSON.stringify({
            children: chunk.map((item) => ({
              object: "block",
              type: "to_do",
              to_do: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: `[${PLAN_ITEM_PRIORITY_TEXT[item.priority]}] ${item.title}` },
                  },
                ],
                checked: false,
              },
            })),
          }),
        },
      );
    }
  }

  private async extractTodoItemsFromPage(page: NotionPage, fallbackDate: string): Promise<TodoItem[]> {
    const date =
      readDateStart(getProperty(page.properties, TODO_DB_PROPERTY.date)) ?? fallbackDate;
    const blocks = await this.listPageBlocks(page.id);
    const todoBlocks = blocks.filter((block) => block.type === "to_do");

    return todoBlocks
      .map((block) => {
        const title = readRichTextArray(block.to_do?.rich_text);
        if (!title) {
          return null;
        }
        return {
          id: block.id,
          title,
          status: block.to_do?.checked ? "done" : "not_started",
          date,
        } as TodoItem;
      })
      .filter((item): item is TodoItem => item !== null);
  }

  private async listPageBlocks(pageId: string): Promise<NotionBlock[]> {
    const allBlocks: NotionBlock[] = [];
    let cursor: string | null | undefined = undefined;

    do {
      const params = new URLSearchParams({ page_size: "100" });
      if (cursor) {
        params.set("start_cursor", cursor);
      }
      const response = await this.notionFetchJson<NotionBlockChildrenResponse>(
        `/blocks/${encodeURIComponent(pageId)}/children?${params.toString()}`,
        { method: "GET" },
      );
      allBlocks.push(...response.results);
      cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);

    return allBlocks;
  }

  private mapTimedTodo(page: NotionPage): TimedTodo | null {
    const titleProperty = getProperty(page.properties, TODO_DB_PROPERTY.title);
    const reminderProperty = getProperty(page.properties, TODO_DB_PROPERTY.reminderTime);
    const reminderStart = readDateStart(reminderProperty);

    if (!reminderStart) {
      return null;
    }

    return {
      id: page.id,
      title: readTitleText(titleProperty),
      reminderTime: toHHmm(reminderStart),
    };
  }

  private mapResearchLog(page: NotionPage): ResearchLog {
    const title = readTitleText(getProperty(page.properties, RESEARCH_DB_PROPERTY.title));
    const date = readNumberValue(getProperty(page.properties, RESEARCH_DB_PROPERTY.date)) ?? 0;
    const author = readRichText(getProperty(page.properties, RESEARCH_DB_PROPERTY.author));
    const venueTier = readSelectOrStatusName(
      getProperty(page.properties, RESEARCH_DB_PROPERTY.venueTier),
    );
    const readingStatus = readSelectOrStatusName(
      getProperty(page.properties, RESEARCH_DB_PROPERTY.readingStatus),
    );
    const fields = readMultiSelectNames(
      getProperty(page.properties, RESEARCH_DB_PROPERTY.fields),
    );
    const priority = readSelectOrStatusName(
      getProperty(page.properties, RESEARCH_DB_PROPERTY.priority),
    );

    return {
      id: page.id,
      title,
      date,
      author: author || undefined,
      venueTier: venueTier || undefined,
      readingStatus: readingStatus || undefined,
      fields: fields.length > 0 ? fields : undefined,
      priority: priority || undefined,
    };
  }

  private async notionFetchJson<T>(
    path: string,
    init: RequestInit,
    databaseIdForError?: string,
    retryCount = 0,
  ): Promise<T> {
    const apiToken = await this.getNotionToken();
    const url = `${NOTION_API_BASE_URL}${path}`;
    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      throw new NotionServiceError(
        "network",
        `Notion network request failed: ${stringifyUnknown(error)}`,
      );
    }

    if (response.status === 429 && retryCount < MAX_429_RETRIES) {
      await sleepMs(computeBackoffMs(retryCount));
      return this.notionFetchJson(path, init, databaseIdForError, retryCount + 1);
    }

    if (!response.ok) {
      const message = await extractNotionErrorMessage(response);
      if (response.status === 401 || response.status === 403) {
        throw new NotionServiceError("auth_failed", message);
      }
      if (response.status === 429) {
        throw new NotionServiceError("rate_limited", message);
      }
      if (response.status === 404) {
        const dbHint = databaseIdForError ? ` (databaseId=${databaseIdForError})` : "";
        throw new NotionServiceError("db_not_found", `${message}${dbHint}`);
      }
      throw new NotionServiceError("unknown", message);
    }

    return (await response.json()) as T;
  }

  private async getNotionToken(): Promise<string> {
    let token: string;
    try {
      token = await this.tokenProvider();
    } catch (error) {
      if (error instanceof NotionServiceError) {
        throw error;
      }
      throw new NotionServiceError(
        "auth_failed",
        `Failed to read Notion token: ${stringifyUnknown(error)}`,
      );
    }

    if (!token || token.trim().length === 0) {
      throw new NotionServiceError(
        "auth_failed",
        "Notion token is missing in SQLite config table (key: notionToken).",
      );
    }

    return token.trim();
  }
}

export const notionService = new NotionService();

async function readNotionTokenFromTauriConfig(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  const token = await invoke<string | null>("config_get_value", { key: "notionToken" });
  return token ?? "";
}

function daysFromToday(deltaDays: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + deltaDays);
  return date;
}

function toLocalDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toHHmm(dateString: string): string {
  const parsed = new Date(dateString);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  }
  const match = dateString.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "00:00";
}

function getProperty(
  properties: Record<string, unknown>,
  propertyName: string,
): Record<string, unknown> | null {
  const property = properties[propertyName];
  if (!property || typeof property !== "object") {
    return null;
  }
  return property as Record<string, unknown>;
}

function readTitleText(property: Record<string, unknown> | null): string {
  const title = property?.title;
  if (!Array.isArray(title)) {
    return "";
  }
  return title
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const record = item as Record<string, unknown>;
      const plainText = record.plain_text;
      if (typeof plainText === "string") {
        return plainText;
      }
      const text = record.text;
      if (!text || typeof text !== "object") {
        return "";
      }
      const content = (text as Record<string, unknown>).content;
      return typeof content === "string" ? content : "";
    })
    .join("")
    .trim();
}

function readRichText(property: Record<string, unknown> | null): string {
  const richText = property?.rich_text;
  return readRichTextArray(richText);
}

function readRichTextArray(richText: unknown): string {
  if (!Array.isArray(richText)) {
    return "";
  }
  return richText
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const plainText = (item as Record<string, unknown>).plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("")
    .trim();
}

function readSelectOrStatusName(property: Record<string, unknown> | null): string | undefined {
  return readNestedName(property?.select) ?? readNestedName(property?.status);
}

function readNestedName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" ? name : undefined;
}

function readDateStart(property: Record<string, unknown> | null): string | undefined {
  const date = property?.date;
  if (!date || typeof date !== "object") {
    return undefined;
  }
  const start = (date as Record<string, unknown>).start;
  return typeof start === "string" ? start : undefined;
}

function readNumberValue(property: Record<string, unknown> | null): number | undefined {
  const number = property?.number;
  return typeof number === "number" ? number : undefined;
}

function readMultiSelectNames(property: Record<string, unknown> | null): string[] {
  const multiSelect = property?.multi_select;
  if (!Array.isArray(multiSelect)) {
    return [];
  }
  return multiSelect
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const name = (item as Record<string, unknown>).name;
      return typeof name === "string" ? name : "";
    })
    .filter((name) => name.length > 0);
}

async function extractNotionErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as NotionErrorResponse;
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return body.message.trim();
    }
  } catch {
    // ignore parse failure and use fallback below
  }
  return `Notion API request failed with status ${response.status}.`;
}

function computeBackoffMs(retryCount: number): number {
  const base = 300 * Math.pow(2, retryCount);
  const jitter = Math.floor(Math.random() * 150);
  return base + jitter;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stringifyUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}
