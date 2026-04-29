import { describe, expect, it } from "vitest";
import {
  ChatContextBuilder,
  formatRecalled,
} from "../ChatContextBuilder";
import type { ChatMemoryResult, ChatMemoryStore } from "../ChatMemoryStore";
import type { ChatHistoryStore, ChatMessageRecord } from "../chat-history-store";
import type { DeepSeekService } from "../DeepSeekService";

function createRecord(partial: Partial<ChatMessageRecord>): ChatMessageRecord {
  return {
    id: partial.id ?? 1,
    sessionId: partial.sessionId ?? "s1",
    role: partial.role ?? "user",
    content: partial.content ?? "content",
    createdAtIso: partial.createdAtIso ?? "2026-04-29T12:00:00",
  };
}

function createBuilder(memoryResult: ChatMemoryResult): ChatContextBuilder {
  const mockHistoryStore: ChatHistoryStore = {
    append: async () => undefined,
    listBySession: async () => [],
    listRecent: async () => [],
  };
  const mockMemoryStore: ChatMemoryStore = {
    buildIndex: async () => undefined,
    query: async () => memoryResult,
  };
  const mockDeepSeekService = {
    getSystemPrompt: () => "system-prompt",
  } as unknown as DeepSeekService;

  return new ChatContextBuilder(
    mockHistoryStore,
    mockMemoryStore,
    mockDeepSeekService,
  );
}

describe("ChatContextBuilder", () => {
  it("assembles [system, recalled-system, ...recent, user] when recalled exists", async () => {
    const builder = createBuilder({
      recalled: [
        createRecord({ role: "user", content: "history-user" }),
      ],
      recentWindow: [
        createRecord({ role: "system", content: "skip-me" }),
        createRecord({ role: "user", content: "recent-user" }),
        createRecord({ role: "ichan", content: "recent-ichan" }),
      ],
    });

    const messages = await builder.getChatContext("current", "s1");
    expect(messages.map((m) => m.role)).toEqual([
      "system",
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(messages[1].content).toContain("以下是相关历史:");
  });

  it("does not insert recalled system block when recalled is empty", async () => {
    const builder = createBuilder({
      recalled: [],
      recentWindow: [createRecord({ role: "user", content: "recent-user" })],
    });

    const messages = await builder.getChatContext("current", "s1");
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "user"]);
  });
});

describe("formatRecalled", () => {
  it("maps role labels correctly", () => {
    const text = formatRecalled([
      createRecord({ role: "user", createdAtIso: "2026-04-29T08:00:00", content: "u" }),
      createRecord({ role: "ichan", createdAtIso: "2026-04-29T08:01:00", content: "i" }),
    ]);
    expect(text).toContain("[2026-04-29 08:00] 你: u");
    expect(text).toContain("[2026-04-29 08:01] i酱: i");
  });

  it("truncates overlong content to 150 chars with ellipsis", () => {
    const longContent = "a".repeat(170);
    const text = formatRecalled([
      createRecord({ role: "user", content: longContent }),
    ]);
    expect(text).toContain(`${"a".repeat(150)}…`);
    expect(text).not.toContain(`${"a".repeat(151)}…`);
  });
});
