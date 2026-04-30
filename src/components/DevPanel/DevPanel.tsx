import type { PetFullState, StateMachineSnapshot } from "../Pet/types";
import type { ReminderSchedulerSnapshot } from "../../services/ReminderScheduler";
import type { CSSProperties } from "react";
import "./dev-panel.css";

export interface DevPanelTimerItem {
  handle: number;
  name: string;
  timeoutMs: number;
  remainingMs: number;
}

export interface DevPanelProps {
  visible: boolean;
  shortcut: string;
  clickThroughShortcut: string;
  dockWidthPx?: number;
  petState: Readonly<PetFullState> | null;
  machineSnapshot: Readonly<StateMachineSnapshot> | null;
  currentMoveRequestId: number | null;
  lastCsvImportDate: string | null;
  hungryThresholdDays: number;
  hungryIsHungry: boolean;
  hungryDaysSinceFeed: number;
  schedulerSnapshot: ReminderSchedulerSnapshot | null;
  timerItems: readonly DevPanelTimerItem[];
  onClose: () => void;
  onForceDrowsy: () => void;
  onForceNapping: () => void;
  onForceWakeFromNap: () => void;
  onForceDialogOpen: () => void;
  onForceDialogClose: () => void;
  onForceDialogOpenFromDrowsy: () => void;
  onForceDialogOpenFromNapping: () => void;
  onRoamingPulse: () => void;
  onResetIdleAwake: () => void;
  onInjectPat: () => void;
  onInjectFeed: () => void;
  onForceReminderDueRaw: () => void;
  onSimulateNotionTimedTodo: () => void;
  onInjectExit: () => void;
  onInjectMovementArrive: () => void;
  onToggleHungry: () => void;
  onToggleClickThrough: () => void;
  onOpenDialogMock: () => void;
  onAppendIchanMessage: () => void;
  onAppendUserMessage: () => void;
  onLongTextDemo: () => void;
  onHistoryReviewDemo: () => void;
  onCloseDialog: () => void;
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatMs(value: number): string {
  return `${Math.max(0, Math.round(value))}ms`;
}

export default function DevPanel({
  visible,
  shortcut,
  clickThroughShortcut,
  dockWidthPx = 360,
  petState,
  machineSnapshot,
  currentMoveRequestId,
  lastCsvImportDate,
  hungryThresholdDays,
  hungryIsHungry,
  hungryDaysSinceFeed,
  schedulerSnapshot,
  timerItems,
  onClose,
  onForceDrowsy,
  onForceNapping,
  onForceWakeFromNap,
  onForceDialogOpen,
  onForceDialogClose,
  onForceDialogOpenFromDrowsy,
  onForceDialogOpenFromNapping,
  onRoamingPulse,
  onResetIdleAwake,
  onInjectPat,
  onInjectFeed,
  onForceReminderDueRaw,
  onSimulateNotionTimedTodo,
  onInjectExit,
  onInjectMovementArrive,
  onToggleHungry,
  onToggleClickThrough,
  onOpenDialogMock,
  onAppendIchanMessage,
  onAppendUserMessage,
  onLongTextDemo,
  onHistoryReviewDemo,
  onCloseDialog,
}: DevPanelProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="dev-panel-host" aria-live="polite">
      <aside
        className="dev-panel"
        aria-label="DEV Overlay Panel"
        style={{ "--dev-panel-width": `${dockWidthPx}px` } as CSSProperties}
      >
        <header className="dev-panel__header">
          <div>
            <h2 className="dev-panel__title">DEV Overlay Panel</h2>
            <p className="dev-panel__hint">
              Toggle: <code>{shortcut}</code> | Click-through: <code>{clickThroughShortcut}</code>
            </p>
          </div>
          <button className="dev-panel__button dev-panel__button--ghost" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <section className="dev-panel__group">
          <h3 className="dev-panel__group-title">State Force</h3>
          <div className="dev-panel__actions">
            <button className="dev-panel__button" onClick={onForceDrowsy} type="button">Force idle.drowsy</button>
            <button className="dev-panel__button" onClick={onForceNapping} type="button">Force idle.napping</button>
            <button className="dev-panel__button" onClick={onForceWakeFromNap} type="button">Force wake.from_nap path</button>
            <button className="dev-panel__button" onClick={onRoamingPulse} type="button">Roaming Pulse</button>
            <button className="dev-panel__button" onClick={onResetIdleAwake} type="button">Reset idle.awake</button>
          </div>
        </section>

        <section className="dev-panel__group">
          <h3 className="dev-panel__group-title">Force PetEvent (B2-9)</h3>
          <div className="dev-panel__actions">
            <button className="dev-panel__button" onClick={onForceDialogOpen} type="button">Force dialog.open</button>
            <button className="dev-panel__button" onClick={onForceDialogClose} type="button">Force dialog.close</button>
            <button className="dev-panel__button" onClick={onForceDialogOpenFromDrowsy} type="button">Force dialog.open from drowsy</button>
            <button className="dev-panel__button" onClick={onForceDialogOpenFromNapping} type="button">Force dialog.open from napping</button>
          </div>
        </section>

        <section className="dev-panel__group">
          <h3 className="dev-panel__group-title">Event Inject</h3>
          <div className="dev-panel__actions">
            <button className="dev-panel__button" onClick={onInjectPat} type="button">user.pat</button>
            <button className="dev-panel__button" onClick={onInjectFeed} type="button">user.feed</button>
            <button className="dev-panel__button" onClick={onForceReminderDueRaw} type="button">
              Force reminder.due (raw)
            </button>
            <button className="dev-panel__button" onClick={onSimulateNotionTimedTodo} type="button">
              Simulate Notion timed todo
            </button>
            <button className="dev-panel__button" onClick={onInjectExit} type="button">user.exit</button>
            <button
              className="dev-panel__button"
              disabled={currentMoveRequestId === null}
              onClick={onInjectMovementArrive}
              type="button"
            >
              movement.arrive {currentMoveRequestId === null ? "(N/A)" : `#${currentMoveRequestId}`}
            </button>
          </div>
        </section>

        <section className="dev-panel__group">
          <h3 className="dev-panel__group-title">Flags / Overlay</h3>
          <div className="dev-panel__actions">
            <button className="dev-panel__button" onClick={onToggleHungry} type="button">Toggle isHungry</button>
            <button className="dev-panel__button" onClick={onToggleClickThrough} type="button">Toggle click-through</button>
          </div>
        </section>

        <section className="dev-panel__group">
          <h3 className="dev-panel__group-title">Dialog Mock</h3>
          <div className="dev-panel__actions">
            <button className="dev-panel__button" onClick={onOpenDialogMock} type="button">Open Dialog Mock</button>
            <button className="dev-panel__button" onClick={onAppendIchanMessage} type="button">Append Ichan Message</button>
            <button className="dev-panel__button" onClick={onAppendUserMessage} type="button">Append User Message</button>
            <button className="dev-panel__button" onClick={onLongTextDemo} type="button">Long Text Demo</button>
            <button className="dev-panel__button" onClick={onHistoryReviewDemo} type="button">History Review Demo</button>
            <button className="dev-panel__button" onClick={onCloseDialog} type="button">Close Dialog</button>
          </div>
        </section>

        <section className="dev-panel__group">
          <h3 className="dev-panel__group-title">Realtime State</h3>
          <div className="dev-panel__state-grid">
            <article className="dev-panel__state-card">
              <h4 className="dev-panel__state-title">PetFullState</h4>
              <pre className="dev-panel__state">{toPrettyJson(petState)}</pre>
            </article>
            <article className="dev-panel__state-card">
              <h4 className="dev-panel__state-title">Playback</h4>
              <pre className="dev-panel__state">
                {toPrettyJson({
                  currentAnimationToken: machineSnapshot?.currentAnimationToken ?? null,
                  queuedEventCount: machineSnapshot?.queuedEventCount ?? 0,
                })}
              </pre>
            </article>
            <article className="dev-panel__state-card">
              <h4 className="dev-panel__state-title">Movement</h4>
              <pre className="dev-panel__state">
                {toPrettyJson({
                  state: petState?.movement.state ?? null,
                  direction: petState?.movement.direction ?? null,
                  target: petState?.movement.target ?? null,
                  requestId: currentMoveRequestId,
                })}
              </pre>
            </article>
            <article className="dev-panel__state-card">
              <h4 className="dev-panel__state-title">Timers</h4>
              <pre className="dev-panel__state">
                {toPrettyJson(
                  timerItems.map((timer) => ({
                    handle: timer.handle,
                    name: timer.name,
                    timeoutMs: formatMs(timer.timeoutMs),
                    remainingMs: formatMs(timer.remainingMs),
                  })),
                )}
              </pre>
            </article>
            <article className="dev-panel__state-card">
              <h4 className="dev-panel__state-title">Hungry Decision</h4>
              <pre className="dev-panel__state">
                {toPrettyJson({
                  lastCsvImportDate,
                  thresholdDays: hungryThresholdDays,
                  isHungry: hungryIsHungry,
                  daysSinceFeed: hungryDaysSinceFeed === Number.POSITIVE_INFINITY
                    ? "Infinity"
                    : hungryDaysSinceFeed,
                })}
              </pre>
            </article>
            <article className="dev-panel__state-card">
              <h4 className="dev-panel__state-title">Scheduler</h4>
              <pre className="dev-panel__state">
                {toPrettyJson({
                  status: schedulerSnapshot?.status ?? null,
                  queueSize: schedulerSnapshot?.queueSize ?? 0,
                  activeReminder: schedulerSnapshot?.activeReminder
                    ? {
                      id: schedulerSnapshot.activeReminder.id,
                      title: schedulerSnapshot.activeReminder.title,
                      reminderTime: schedulerSnapshot.activeReminder.reminderTime,
                    }
                    : null,
                  dismissedTodayCount: schedulerSnapshot?.dismissedTodayCount ?? 0,
                  dialogGateRetryCount: schedulerSnapshot?.dialogGateRetryCount ?? 0,
                  lastPollError: schedulerSnapshot?.lastPollError ?? null,
                  lastPollAt: schedulerSnapshot?.lastPollAt ?? null,
                })}
              </pre>
            </article>
          </div>
        </section>
      </aside>
    </div>
  );
}
