import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { PetContextService } from "../PetContextService";

type KvStore = Map<string, string>;

function installInvokeWithStore(
  store: KvStore,
  options?: { failRead?: boolean; failWrite?: boolean },
): void {
  invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
    const key = String(payload?.key ?? "");
    if (command === "config_get_value") {
      if (options?.failRead) {
        throw new Error("read failed");
      }
      return store.has(key) ? store.get(key)! : null;
    }
    if (command === "config_set_value") {
      if (options?.failWrite) {
        throw new Error("write failed");
      }
      store.set(key, String(payload?.value ?? ""));
      return null;
    }
    throw new Error(`unexpected command: ${command}`);
  });
}

describe("PetContextService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.useRealTimers();
  });

  it("getLastExitClean parses true/false/null", async () => {
    const store = new Map<string, string>();
    installInvokeWithStore(store);

    expect(await PetContextService.getLastExitClean()).toBeNull();
    store.set("petcontext.lastExitClean", "true");
    expect(await PetContextService.getLastExitClean()).toBe(true);
    store.set("petcontext.lastExitClean", "false");
    expect(await PetContextService.getLastExitClean()).toBe(false);
  });

  it("setLastExitClean writes boolean string", async () => {
    const store = new Map<string, string>();
    installInvokeWithStore(store);

    await PetContextService.setLastExitClean(true);
    expect(store.get("petcontext.lastExitClean")).toBe("true");
  });

  it("get/setLastSeenDate roundtrip", async () => {
    const store = new Map<string, string>();
    installInvokeWithStore(store);

    await PetContextService.setLastSeenDate("2026-05-01");
    expect(await PetContextService.getLastSeenDate()).toBe("2026-05-01");
  });

  it("loadSessionBootstrap returns first-launch defaults and writes dirty-bit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00.000Z"));
    const store = new Map<string, string>();
    installInvokeWithStore(store);

    const result = await PetContextService.loadSessionBootstrap();

    expect(result).toEqual({ isNewDay: true, lastExitClean: false });
    expect(store.get("petcontext.lastExitClean")).toBe("false");
    expect(store.get("petcontext.lastSeenDate")).toBe("2026-05-01");
  });

  it("loadSessionBootstrap computes same-day and clean-exit flags from store", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T03:00:00.000Z"));
    const store = new Map<string, string>([
      ["petcontext.lastExitClean", "true"],
      ["petcontext.lastSeenDate", "2026-05-01"],
    ]);
    installInvokeWithStore(store);

    const result = await PetContextService.loadSessionBootstrap();
    expect(result).toEqual({ isNewDay: false, lastExitClean: true });
  });

  it("loadSessionBootstrap degrades to unclean defaults on read failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T03:00:00.000Z"));
    const store = new Map<string, string>();
    installInvokeWithStore(store, { failRead: true });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await PetContextService.loadSessionBootstrap();
      expect(result).toEqual({ isNewDay: true, lastExitClean: false });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("loadSessionBootstrap does not throw when dirty-bit write fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T03:00:00.000Z"));
    const store = new Map<string, string>([
      ["petcontext.lastExitClean", "false"],
      ["petcontext.lastSeenDate", "2026-04-30"],
    ]);
    installInvokeWithStore(store, { failWrite: true });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await PetContextService.loadSessionBootstrap();
      expect(result).toEqual({ isNewDay: true, lastExitClean: false });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("markCleanExit writes true", async () => {
    const store = new Map<string, string>();
    installInvokeWithStore(store);

    await PetContextService.markCleanExit();
    expect(store.get("petcontext.lastExitClean")).toBe("true");
  });
});

