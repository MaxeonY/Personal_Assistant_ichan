import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetEvent } from "../components/Pet/types";
import { ReminderScheduler, type ReminderSchedulerDeps } from "./ReminderScheduler";

function createTodo(id: string, reminderTime: string): { id: string; title: string; reminderTime: string } {
  return {
    id,
    title: `todo-${id}`,
    reminderTime,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ReminderScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T10:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createScheduler(overrides: Partial<ReminderSchedulerDeps> = {}) {
    const notionService = overrides.notionService ?? {
      getTodayTimedTodos: vi.fn(async () => []),
    };
    const dispatch = vi.fn<(event: PetEvent) => void>();
    if (overrides.dispatch) {
      dispatch.mockImplementation(overrides.dispatch);
    }
    const getIsDialogActive = overrides.getIsDialogActive ?? vi.fn(() => false);
    const resolveTarget = overrides.resolveTarget ?? vi.fn(() => ({ x: 120, y: 12 }));
    const getWorkareaBounds = overrides.getWorkareaBounds
      ?? vi.fn(async () => ({ minX: 10, maxX: 210, posY: 12 }));
    const onSnapshot = overrides.onSnapshot ?? vi.fn();

    const deps: ReminderSchedulerDeps = {
      notionService,
      todoDbId: "test-db-id",
      dispatch: dispatch as (event: PetEvent) => void,
      resolveTarget,
      getWorkareaBounds,
      getIsDialogActive,
      onSnapshot,
    };

    return {
      scheduler: new ReminderScheduler(deps),
      deps,
      notionService,
      dispatch,
      getIsDialogActive,
      resolveTarget,
      getWorkareaBounds,
      onSnapshot,
    };
  }

  it("runs first poll immediately after start()", async () => {
    const { scheduler, notionService } = createScheduler();
    scheduler.start();
    await flushMicrotasks();
    expect(notionService.getTodayTimedTodos).toHaveBeenCalledTimes(1);
  });

  it("keeps at most 3 items in queue and skips overflow todos", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scheduler, notionService, dispatch } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [
          createTodo("1", "09:00"),
          createTodo("2", "09:01"),
          createTodo("3", "09:02"),
          createTodo("4", "09:03"),
          createTodo("5", "09:04"),
        ]),
      },
    });
    scheduler.start();
    await flushMicrotasks();

    const snapshot = scheduler.getSnapshot();
    expect(notionService.getTodayTimedTodos).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(snapshot.activeReminder?.id).toBe("1");
    expect(snapshot.queueSize).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it("does not preempt when activeReminder already exists", async () => {
    const { scheduler, dispatch } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [createTodo("1", "09:00"), createTodo("2", "09:01")]),
      },
    });
    scheduler.start();
    await flushMicrotasks();

    scheduler.devSimulate(createTodo("3", "09:02"));
    await flushMicrotasks();
    const snapshot = scheduler.getSnapshot();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(snapshot.activeReminder?.id).toBe("1");
    expect(snapshot.queueSize).toBe(2);
  });

  it("adds dismissed reminder id and skips it in subsequent polls", async () => {
    const { scheduler, dispatch, notionService } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi
          .fn(async () => [createTodo("same-id", "09:00")])
          .mockResolvedValueOnce([createTodo("same-id", "09:00")])
          .mockResolvedValueOnce([createTodo("same-id", "09:00")]),
      },
    });
    scheduler.start();
    await flushMicrotasks();

    scheduler.dismiss("devpanel");
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    await flushMicrotasks();

    const dueCalls = dispatch.mock.calls.filter(
      (args: unknown[]) => (args[0] as { type?: string } | undefined)?.type === "reminder.due",
    );
    const dismissCalls = dispatch.mock.calls.filter(
      (args: unknown[]) => (args[0] as { type?: string } | undefined)?.type === "reminder.dismiss",
    );
    expect(dueCalls).toHaveLength(1);
    expect(dismissCalls).toHaveLength(1);
    expect(notionService.getTodayTimedTodos).toHaveBeenCalledTimes(2);
  });

  it("retries when dialog is active and dispatches after dialog closes", async () => {
    let dialogActive = true;
    const { scheduler, dispatch } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [createTodo("1", "09:00")]),
      },
      getIsDialogActive: vi.fn(() => dialogActive),
    });

    scheduler.start();
    await flushMicrotasks();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "reminder.due" }));
    expect(scheduler.getSnapshot().dialogGateRetryCount).toBe(1);

    dialogActive = false;
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "reminder.due" }));
    expect(scheduler.getSnapshot().dialogGateRetryCount).toBe(0);
  });

  it("drops reminder after dialog gate max retries and marks as dismissed", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scheduler, dispatch } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [createTodo("1", "09:00")]),
      },
      getIsDialogActive: vi.fn(() => true),
    });

    scheduler.start();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(500 * 61);
    await flushMicrotasks();

    const snapshot = scheduler.getSnapshot();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "reminder.due" }));
    expect(snapshot.activeReminder).toBeNull();
    expect(snapshot.queueSize).toBe(0);
    expect(snapshot.dismissedTodayCount).toBe(1);
    expect(snapshot.dialogGateRetryCount).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith("[reminder] dropped after 30s of dialog activity:", "1");
    warnSpy.mockRestore();
  });

  it("does not create duplicate retry timer while retry timer already exists", async () => {
    const { scheduler } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [createTodo("1", "09:00")]),
      },
      getIsDialogActive: vi.fn(() => true),
    });

    scheduler.start();
    await flushMicrotasks();
    const timerCountAfterStart = vi.getTimerCount();

    scheduler.devSimulate(createTodo("2", "09:01"));
    await flushMicrotasks();
    const timerCountAfterSimulate = vi.getTimerCount();

    expect(timerCountAfterSimulate).toBe(timerCountAfterStart);
  });

  it("rolls back active reminder and requeues candidate when dispatch throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { scheduler, dispatch } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [createTodo("1", "09:00")]),
      },
      dispatch: vi.fn(() => {
        throw new Error("boom");
      }),
    });

    scheduler.start();
    await flushMicrotasks();

    const snapshot = scheduler.getSnapshot();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(snapshot.activeReminder).toBeNull();
    expect(snapshot.queueSize).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("clears dismissed ids and polls immediately when local day changes", async () => {
    const { scheduler, dispatch, notionService } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [createTodo("same-id", "09:00")]),
      },
    });

    scheduler.start();
    await flushMicrotasks();
    scheduler.dismiss("bubble");
    await flushMicrotasks();

    vi.setSystemTime(new Date("2026-05-01T10:01:00"));
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await flushMicrotasks();

    const dueCalls = dispatch.mock.calls.filter(
      (args: unknown[]) => (args[0] as { type?: string } | undefined)?.type === "reminder.due",
    );
    expect(notionService.getTodayTimedTodos).toHaveBeenCalledTimes(2);
    expect(dueCalls).toHaveLength(2);
  });

  it("skips invalid reminderTime but keeps processing valid todos", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scheduler, dispatch } = createScheduler({
      notionService: {
        getTodayTimedTodos: vi.fn(async () => [
          createTodo("bad-time", "25:61"),
          createTodo("good-time", "09:00"),
        ]),
      },
    });

    scheduler.start();
    await flushMicrotasks();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "reminder.due" }));
    expect(scheduler.getSnapshot().activeReminder?.id).toBe("good-time");
    expect(warnSpy).toHaveBeenCalledWith(
      "[reminder] invalid reminderTime, skipped:",
      "bad-time",
      "25:61",
    );
    warnSpy.mockRestore();
  });
});
