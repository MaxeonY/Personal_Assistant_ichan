import type { ChatMessage } from "../types/deepseek-types";
import { DeepSeekService } from "./DeepSeekService";
import {
  chatHistoryStore,
  type ChatHistoryStore,
  type ChatMessageRecord,
} from "./chat-history-store";
import {
  chatMemoryStore,
  type ChatMemoryStore,
  type ChatMemoryResult,
} from "./ChatMemoryStore";

export const RECENT_TURNS_DEFAULT = 6;
export const RECALL_TOP_K_DEFAULT = 3;
const RECENT_FALLBACK_LIMIT = RECENT_TURNS_DEFAULT * 2;
const RECALL_LINE_MAX_LENGTH = 150;

export class ChatContextBuilder {
  private readonly historyStore: ChatHistoryStore;
  private readonly memoryStore: ChatMemoryStore;
  private readonly deepSeekService: DeepSeekService;

  constructor(
    historyStore?: ChatHistoryStore,
    memoryStore?: ChatMemoryStore,
    deepSeekService?: DeepSeekService,
  ) {
    this.historyStore = historyStore ?? chatHistoryStore;
    this.memoryStore = memoryStore ?? chatMemoryStore;
    this.deepSeekService = deepSeekService ?? new DeepSeekService();
  }

  async getChatContext(
    currentUserMessage: string,
    sessionId?: string,
  ): Promise<ChatMessage[]> {
    const systemPrompt = this.deepSeekService.getSystemPrompt("chat");
    const baseMessages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

    const memoryResult = await this.getMemoryResult(currentUserMessage, sessionId);

    const recalledText = formatRecalled(memoryResult.recalled);
    if (recalledText) {
      baseMessages.push({ role: "system", content: recalledText });
    }

    const recentMessages = memoryResult.recentWindow
      .filter((record) => record.role !== "system")
      .map(mapRecentRecordToChatMessage);

    return [
      ...baseMessages,
      ...recentMessages,
      { role: "user", content: currentUserMessage },
    ];
  }

  private async getMemoryResult(
    currentUserMessage: string,
    sessionId?: string,
  ): Promise<ChatMemoryResult> {
    try {
      return await this.memoryStore.query({
        currentUserMessage,
        recentTurns: RECENT_TURNS_DEFAULT,
        recallTopK: RECALL_TOP_K_DEFAULT,
        sessionId,
        excludeSessionId: sessionId,
      });
    } catch {
      return this.getFallbackMemoryResult(sessionId);
    }
  }

  private async getFallbackMemoryResult(sessionId?: string): Promise<ChatMemoryResult> {
    try {
      const records = sessionId
        ? await this.historyStore.listBySession(sessionId, undefined, RECENT_FALLBACK_LIMIT)
        : await this.historyStore.listRecent(RECENT_FALLBACK_LIMIT);
      return {
        recalled: [],
        recentWindow: records.slice().reverse(),
      };
    } catch {
      return { recalled: [], recentWindow: [] };
    }
  }
}

function mapRecentRecordToChatMessage(record: ChatMessageRecord): ChatMessage {
  return {
    role: record.role === "ichan" ? "assistant" : "user",
    content: record.content,
  };
}

function toRecalledRole(role: ChatMessageRecord["role"]): "你" | "i酱" {
  return role === "ichan" ? "i酱" : "你";
}

function toRecalledTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function truncateRecalledContent(content: string): string {
  if (content.length <= RECALL_LINE_MAX_LENGTH) {
    return content;
  }
  return `${content.slice(0, RECALL_LINE_MAX_LENGTH)}…`;
}

export function formatRecalled(recalled: ChatMessageRecord[]): string {
  if (recalled.length === 0) {
    return "";
  }

  const lines = recalled.map((record) => {
    const role = toRecalledRole(record.role);
    const time = toRecalledTime(record.createdAtIso);
    const content = truncateRecalledContent(record.content);
    return `[${time}] ${role}: ${content}`;
  });
  return `以下是相关历史:\n${lines.join("\n")}`;
}

export const chatContextBuilder = new ChatContextBuilder();
