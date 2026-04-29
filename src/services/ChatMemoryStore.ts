import { invoke } from "@tauri-apps/api/core";
import {
  chatHistoryStore,
  type ChatHistoryStore,
  type ChatMessageRecord,
} from "./chat-history-store";

export interface ChatMemoryQuery {
  currentUserMessage: string;
  recentTurns: number;
  recallTopK: number;
  excludeSessionId?: string;
  sessionId?: string;
}

export interface ChatMemoryResult {
  recalled: ChatMessageRecord[];
  recentWindow: ChatMessageRecord[];
}

export interface ChatMemoryStore {
  buildIndex(): Promise<void>;
  query(input: ChatMemoryQuery): Promise<ChatMemoryResult>;
}

interface BuildIndexResponse {
  rebuilt: boolean;
  indexed: number;
}

function normalizeRecentTurns(value: number): number {
  return Math.max(0, Math.floor(value));
}

function normalizeRecallTopK(value: number): number {
  return Math.max(0, Math.floor(value));
}

function isFtsDisabledError(error: unknown): boolean {
  const text = String(error ?? "");
  return text.includes("FTS5");
}

export class ChatMemoryStoreImpl implements ChatMemoryStore {
  private readonly historyStore: ChatHistoryStore;

  private buildPromise: Promise<void> | null = null;
  private hasRetriedBuild = false;
  private fts5Disabled = false;

  constructor(historyStore?: ChatHistoryStore) {
    this.historyStore = historyStore ?? chatHistoryStore;
  }

  async buildIndex(): Promise<void> {
    if (this.fts5Disabled) {
      return;
    }
    if (this.buildPromise) {
      return this.buildPromise;
    }

    this.buildPromise = this.runBuildIndex();
    return this.buildPromise;
  }

  async query(input: ChatMemoryQuery): Promise<ChatMemoryResult> {
    const recentWindow = await this.loadRecentWindow(input);
    const recallTopK = normalizeRecallTopK(input.recallTopK);
    if (recallTopK <= 0) {
      return { recalled: [], recentWindow };
    }

    try {
      await this.buildIndex();
      if (this.fts5Disabled) {
        return { recalled: [], recentWindow };
      }

      return await invoke<ChatMemoryResult>("chat_memory_query", {
        input: {
          currentUserMessage: input.currentUserMessage,
          recentTurns: normalizeRecentTurns(input.recentTurns),
          recallTopK,
          excludeSessionId: input.excludeSessionId,
          sessionId: input.sessionId,
        },
      });
    } catch (error) {
      if (isFtsDisabledError(error)) {
        this.fts5Disabled = true;
      }
      return { recalled: [], recentWindow };
    }
  }

  private async runBuildIndex(): Promise<void> {
    try {
      await invoke<BuildIndexResponse>("chat_memory_build_index");
      this.hasRetriedBuild = false;
    } catch (error) {
      if (isFtsDisabledError(error)) {
        this.fts5Disabled = true;
        return;
      }
      if (!this.hasRetriedBuild) {
        this.hasRetriedBuild = true;
        await invoke<BuildIndexResponse>("chat_memory_build_index");
        this.hasRetriedBuild = false;
        return;
      }
      this.hasRetriedBuild = false;
      throw error;
    } finally {
      this.buildPromise = null;
    }
  }

  private async loadRecentWindow(input: ChatMemoryQuery): Promise<ChatMessageRecord[]> {
    const recentLimit = normalizeRecentTurns(input.recentTurns) * 2;
    if (recentLimit <= 0) {
      return [];
    }

    try {
      const records = input.sessionId
        ? await this.historyStore.listBySession(input.sessionId, undefined, recentLimit)
        : await this.historyStore.listRecent(recentLimit);
      return records.slice().reverse();
    } catch {
      return [];
    }
  }
}

export const chatMemoryStore = new ChatMemoryStoreImpl();
