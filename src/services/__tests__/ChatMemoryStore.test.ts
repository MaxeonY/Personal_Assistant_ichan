import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { ChatMemoryStoreImpl } from "../ChatMemoryStore";
import type { ChatHistoryStore, ChatMessageRecord } from "../chat-history-store";

function createRecord(id: number): ChatMessageRecord {
  return {
    id,
    sessionId: "s1",
    role: "user",
    content: `msg-${id}`,
    createdAtIso: `2026-04-29T10:0${id}:00`,
  };
}

function createHistoryStore(records: ChatMessageRecord[]): ChatHistoryStore {
  return {
    append: async () => undefined,
    listBySession: async () => records,
    listRecent: async () => records,
  };
}

describe("ChatMemoryStore", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("retries buildIndex once on first failure", async () => {
    invokeMock
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ rebuilt: true, indexed: 1 });

    const store = new ChatMemoryStoreImpl(createHistoryStore([]));
    await store.buildIndex();

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "chat_memory_build_index");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "chat_memory_build_index");
  });

  it("returns degraded recentWindow when FTS5 is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("FTS5 extension is not available"));
    const records = [createRecord(2), createRecord(1)];
    const store = new ChatMemoryStoreImpl(createHistoryStore(records));

    const result = await store.query({
      currentUserMessage: "健身计划",
      recentTurns: 1,
      recallTopK: 3,
      sessionId: "s1",
      excludeSessionId: "s1",
    });

    expect(result.recalled).toEqual([]);
    expect(result.recentWindow.map((r) => r.id)).toEqual([1, 2]);
  });

  it("returns command result when memory query succeeds", async () => {
    invokeMock
      .mockResolvedValueOnce({ rebuilt: false, indexed: 0 })
      .mockResolvedValueOnce({
        recalled: [createRecord(9)],
        recentWindow: [createRecord(1), createRecord(2)],
      });

    const store = new ChatMemoryStoreImpl(createHistoryStore([createRecord(2), createRecord(1)]));
    const result = await store.query({
      currentUserMessage: "健身计划",
      recentTurns: 1,
      recallTopK: 3,
      sessionId: "s1",
      excludeSessionId: "s1",
    });

    expect(result.recalled.map((r) => r.id)).toEqual([9]);
    expect(result.recentWindow.map((r) => r.id)).toEqual([1, 2]);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "chat_memory_build_index");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "chat_memory_query", {
      input: {
        currentUserMessage: "健身计划",
        recentTurns: 1,
        recallTopK: 3,
        excludeSessionId: "s1",
        sessionId: "s1",
      },
    });
  });
});
