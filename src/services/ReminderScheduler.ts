import type { Coord, PetEvent } from "../components/Pet/types";
import { petBehaviorConfig } from "../config/petBehaviorConfig";
import type { TimedTodo } from "../types/notion-types";
import type { WorkareaBounds } from "../utils/windowTargetResolver";

type SchedulerStatus = "idle" | "polling" | "disabled";

interface TimedTodoWithDueAt extends TimedTodo {
  dueAt: number;
}

export interface ReminderSchedulerSnapshot {
  status: SchedulerStatus;
  queueSize: number;
  activeReminder: TimedTodoWithDueAt | null;
  dismissedTodayCount: number;
  dialogGateRetryCount: number;
  lastPollError: string | null;
  lastPollAt: number | null;
}

export interface ReminderSchedulerDeps {
  notionService: {
    getTodayTimedTodos(databaseId: string): Promise<TimedTodo[]>;
  };
  todoDbId: string;
  dispatch: (event: PetEvent) => void;
  resolveTarget: (bounds: WorkareaBounds | null) => Coord;
  getWorkareaBounds: () => Promise<WorkareaBounds | null>;
  getIsDialogActive: () => boolean;
  onSnapshot?: (snapshot: ReminderSchedulerSnapshot) => void;
}

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseTodayDueAt(reminderTime: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
    return null;
  }

  const [hhText, mmText] = reminderTime.split(":");
  const hours = Number(hhText);
  const minutes = Number(mmText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now.getTime();
}

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return null;
}

export class ReminderScheduler {
  private readonly deps: ReminderSchedulerDeps;

  private readonly queue: TimedTodoWithDueAt[] = [];

  private readonly dismissedTodayIds = new Set<string>();

  private status: SchedulerStatus = "idle";

  private activeReminder: TimedTodoWithDueAt | null = null;

  private currentDateKey = getLocalDateKey();

  private dialogGateRetryCount = 0;

  private lastPollError: string | null = null;

  private lastPollAt: number | null = null;

  private pollTimerId: ReturnType<typeof setInterval> | null = null;

  private evaluateTimerId: ReturnType<typeof setInterval> | null = null;

  private evaluateRetryTimerId: ReturnType<typeof setTimeout> | null = null;

  private isDestroyed = false;

  private pollInFlight = false;

  private evaluateInFlight = false;

  private evaluateRequested = false;

  constructor(deps: ReminderSchedulerDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.pollTimerId !== null || this.status === "disabled" || this.isDestroyed) {
      return;
    }

    this.pollTimerId = globalThis.setInterval(() => {
      void this.poll();
    }, petBehaviorConfig.reminder.pollIntervalMs);
    this.evaluateTimerId = globalThis.setInterval(() => {
      this.runEvaluateTick();
    }, petBehaviorConfig.reminder.evaluateIntervalMs);

    void this.poll();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.clearRuntimeTimers();
    this.queue.length = 0;
    this.dismissedTodayIds.clear();
    this.activeReminder = null;
    this.dialogGateRetryCount = 0;
    this.lastPollError = null;
    this.lastPollAt = null;
    this.status = "idle";
    this.pollInFlight = false;
    this.evaluateInFlight = false;
    this.evaluateRequested = false;
    this.emitSnapshot();
  }

  dismiss(_source: "bubble" | "devpanel" | "unknown" = "unknown"): void {
    if (this.activeReminder !== null) {
      this.dismissedTodayIds.add(this.activeReminder.id);
    }
    this.activeReminder = null;
    this.clearEvaluateRetryTimer();
    this.dialogGateRetryCount = 0;
    this.emitSnapshot();

    try {
      this.deps.dispatch({ type: "reminder.dismiss" });
    } catch (error) {
      console.error("[reminder] dispatch reminder.dismiss failed", error);
    }
    this.requestEvaluate();
  }

  devSimulate(todo: TimedTodo): void {
    if (this.status === "disabled" || this.isDestroyed) {
      return;
    }

    if (this.dismissedTodayIds.has(todo.id)) {
      return;
    }
    if (this.activeReminder?.id === todo.id) {
      return;
    }
    if (this.queue.some((item) => item.id === todo.id)) {
      return;
    }

    const dueAt = parseTodayDueAt(todo.reminderTime);
    if (dueAt === null) {
      console.warn("[reminder] invalid reminderTime in devSimulate, skipped:", todo.id, todo.reminderTime);
      return;
    }
    if (this.queue.length >= petBehaviorConfig.reminder.maxQueueSize) {
      console.warn("[reminder] queue is full, dropping todo:", todo.id);
      return;
    }

    this.queue.push({ ...todo, dueAt });
    this.emitSnapshot();
    this.requestEvaluate();
  }

  getSnapshot(): ReminderSchedulerSnapshot {
    return {
      status: this.status,
      queueSize: this.queue.length,
      activeReminder: this.activeReminder,
      dismissedTodayCount: this.dismissedTodayIds.size,
      dialogGateRetryCount: this.dialogGateRetryCount,
      lastPollError: this.lastPollError,
      lastPollAt: this.lastPollAt,
    };
  }

  private emitSnapshot(): void {
    this.deps.onSnapshot?.(this.getSnapshot());
  }

  private disable(reason: unknown): void {
    this.status = "disabled";
    this.clearRuntimeTimers();
    this.queue.length = 0;
    this.activeReminder = null;
    this.dialogGateRetryCount = 0;
    console.error("[reminder] scheduler disabled due to unrecoverable poll error:", reason);
    this.emitSnapshot();
  }

  private clearRuntimeTimers(): void {
    if (this.pollTimerId !== null) {
      globalThis.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
    if (this.evaluateTimerId !== null) {
      globalThis.clearInterval(this.evaluateTimerId);
      this.evaluateTimerId = null;
    }
    this.clearEvaluateRetryTimer();
  }

  private clearEvaluateRetryTimer(): void {
    if (this.evaluateRetryTimerId !== null) {
      globalThis.clearTimeout(this.evaluateRetryTimerId);
      this.evaluateRetryTimerId = null;
    }
  }

  private runEvaluateTick(): void {
    if (this.status === "disabled" || this.isDestroyed) {
      return;
    }

    const nextDateKey = getLocalDateKey();
    if (nextDateKey !== this.currentDateKey) {
      this.currentDateKey = nextDateKey;
      this.dismissedTodayIds.clear();
      this.emitSnapshot();
      void this.poll();
      return;
    }

    this.requestEvaluate();
  }

  private requestEvaluate(): void {
    if (this.status === "disabled" || this.isDestroyed) {
      return;
    }

    if (this.evaluateInFlight) {
      this.evaluateRequested = true;
      return;
    }

    void this.evaluate();
  }

  private async poll(): Promise<void> {
    if (this.status === "disabled" || this.isDestroyed || this.pollInFlight) {
      return;
    }

    this.pollInFlight = true;
    this.status = "polling";
    this.emitSnapshot();
    let isDisabledByError = false;
    try {
      const todos = await this.deps.notionService.getTodayTimedTodos(this.deps.todoDbId);
      this.lastPollAt = Date.now();
      this.lastPollError = null;

      for (const todo of todos) {
        if (this.dismissedTodayIds.has(todo.id)) {
          continue;
        }
        if (this.activeReminder?.id === todo.id) {
          continue;
        }
        if (this.queue.some((item) => item.id === todo.id)) {
          continue;
        }

        const dueAt = parseTodayDueAt(todo.reminderTime);
        if (dueAt === null) {
          console.warn("[reminder] invalid reminderTime, skipped:", todo.id, todo.reminderTime);
          continue;
        }
        if (this.queue.length >= petBehaviorConfig.reminder.maxQueueSize) {
          console.warn("[reminder] queue is full, dropping todo:", todo.id);
          continue;
        }

        this.queue.push({ ...todo, dueAt });
      }
    } catch (error) {
      this.lastPollAt = Date.now();
      this.lastPollError = error instanceof Error ? error.message : String(error);
      const code = getErrorCode(error);
      if (code === "auth_failed" || code === "db_not_found") {
        isDisabledByError = true;
        this.disable(error);
        this.pollInFlight = false;
        return;
      }
      console.warn("[reminder] poll failed, will retry next cycle:", error);
    } finally {
      if (!isDisabledByError) {
        this.status = "idle";
      }
      this.pollInFlight = false;
      this.emitSnapshot();
    }

    this.requestEvaluate();
  }

  private async evaluate(): Promise<void> {
    if (this.status === "disabled" || this.isDestroyed) {
      return;
    }

    this.evaluateInFlight = true;
    try {
      if (this.activeReminder !== null) {
        return;
      }
      if (this.queue.length === 0) {
        return;
      }

      const candidate = this.queue[0];
      if (candidate.dueAt > Date.now()) {
        return;
      }

      if (this.deps.getIsDialogActive()) {
        if (this.evaluateRetryTimerId !== null) {
          return;
        }

        this.dialogGateRetryCount += 1;
        if (this.dialogGateRetryCount > petBehaviorConfig.reminder.dialogGateMaxRetries) {
          this.queue.shift();
          this.dismissedTodayIds.add(candidate.id);
          this.clearEvaluateRetryTimer();
          this.dialogGateRetryCount = 0;
          console.warn("[reminder] dropped after 30s of dialog activity:", candidate.id);
          this.emitSnapshot();
          return;
        }

        this.evaluateRetryTimerId = globalThis.setTimeout(() => {
          this.evaluateRetryTimerId = null;
          this.requestEvaluate();
        }, petBehaviorConfig.reminder.dialogGateRetryMs);
        this.emitSnapshot();
        return;
      }

      this.clearEvaluateRetryTimer();
      this.dialogGateRetryCount = 0;

      const bounds = await this.deps.getWorkareaBounds().catch(() => null);
      const target = this.deps.resolveTarget(bounds);
      this.queue.shift();
      this.activeReminder = candidate;
      this.emitSnapshot();

      try {
        this.deps.dispatch({ type: "reminder.due", target });
      } catch (error) {
        this.activeReminder = null;
        this.queue.unshift(candidate);
        this.emitSnapshot();
        console.error("[reminder] dispatch reminder.due failed", error);
      }
    } finally {
      this.evaluateInFlight = false;
      if (this.evaluateRequested) {
        this.evaluateRequested = false;
        this.requestEvaluate();
      }
    }
  }
}

export type { SchedulerStatus, TimedTodoWithDueAt };
