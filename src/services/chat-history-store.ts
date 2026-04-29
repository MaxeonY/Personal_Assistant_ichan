import { invoke } from "@tauri-apps/api/core";

export type ChatMessageRole = "ichan" | "user" | "system";

export interface ChatMessageRecord {
  id?: number;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAtIso: string;
}

export class ChatHistoryStore {
  async append(record: ChatMessageRecord): Promise<void> {
    await invoke("chat_append_message", { record });
  }

  async listBySession(
    sessionId: string,
    cursor?: number,
    limit = 20,
  ): Promise<ChatMessageRecord[]> {
    return invoke<ChatMessageRecord[]>("chat_list_by_session", {
      sessionId,
      cursor,
      limit,
    });
  }

  async listRecent(limit: number): Promise<ChatMessageRecord[]> {
    return invoke<ChatMessageRecord[]>("chat_list_recent", { limit });
  }
}

export const chatHistoryStore = new ChatHistoryStore();
