import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import type { AnimationPlayer } from "./components/Pet/AnimationPlayer";
import TalkingInteraction from "./components/Dialog/TalkingInteraction";
import type {
  DialogCloseReason,
  DialogTransitionPhase,
  TalkingInteractionHandle,
} from "./components/Dialog/dialog-types";
import {
  DIALOG_ANIMATION,
  DIALOG_PET_LAYOUT,
} from "./components/Dialog/dialog-tokens";
import {
  COMPACT_PET_DISPLAY,
  COMPACT_WINDOW,
  DIALOG_WINDOW,
  assertCompactDialogGeometry,
  getCompactWindowPositionFromDialog,
  getDialogWindowPositionFromCompact,
  isCompactDialogGeometryValid,
} from "./components/Dialog/dialog-transition";
import PetCanvas from "./components/Pet/PetCanvas";
import type {
  DialogOpenSource,
  PetEvent,
  PetFullState,
  StateMachineSnapshot,
  Unsubscribe,
} from "./components/Pet/types";
import { petBehaviorConfig } from "./config/petBehaviorConfig";
import { useDragDropFeed } from "./hooks/useDragDropFeed";
import { routePhysicalEventToDialogOpen } from "./integration/dialogRouter";
import { watchTalkingExitForDialogSync } from "./integration/dialogStateBridge";
import { decideHungry } from "./services/HungryDecisionService";
import { PetContextService } from "./services/PetContextService";
import { PetStateMachine } from "./state/StateMachine";
import type { TimerBackend } from "./state/timers";
import "./App.css";

const IS_DEV_BUILD = import.meta.env.DEV;
const DevPanelLazy = IS_DEV_BUILD
  ? lazy(() => import("./components/DevPanel/DevPanel"))
  : null;

const {
  clickThroughShortcut: CLICK_THROUGH_SHORTCUT,
  shortcutDebounceMs: SHORTCUT_DEBOUNCE_MS,
  statusHideMs: STATUS_HIDE_MS,
} = petBehaviorConfig.app;
const DIALOG_SHORTCUT = "Ctrl+Alt+T";
const DEV_PANEL_SHORTCUT = "Ctrl+Alt+D";
// Engine constant, do not tune
const WINDOW_MOVEMENT_TICK_MS = 16;
const HITBOX_DRAG_START_THRESHOLD_PX = 6;
const PAT_CLICK_DELAY_MS = 520;
const DOUBLE_CLICK_PAT_GUARD_MS = 720;
const DIALOG_MOVEMENT_RESUME_DELAY_MS = 220;
// Engine constant, do not tune
const DEV_PANEL_TIMER_REFRESH_MS = 120;
const DEV_PANEL_DOCK_WIDTH_PX = 360;
const DEV_PANEL_DOCK_GAP_PX = 16;
const {
  edgePaddingPx: WINDOW_EDGE_PADDING_PX,
  roamingSpeedPxPerSec: ROAMING_SPEED_PX_PER_SEC,
  targetedSpeedPxPerSec: TARGETED_SPEED_PX_PER_SEC,
  targetedArrivalThresholdPx: TARGETED_ARRIVAL_THRESHOLD_PX,
  targetedDefaultWorkareaX: TARGETED_DEFAULT_WORKAREA_X,
} = petBehaviorConfig.windowMovement;

type WindowMovementMode = "none" | "roaming" | "targeted";

interface WindowMovementRuntime {
  mode: WindowMovementMode;
  direction: 1 | -1;
  requestId: number | null;
  targetX: number | null;
  minX: number;
  maxX: number;
  posX: number;
  posY: number;
  lastTickAtMs: number | null;
  isRefreshingBounds: boolean;
  isSettingPosition: boolean;
  queuedPosition: { x: number; y: number } | null;
  arrivalDispatchedRequestId: number | null;
}

interface HitboxPointerGesture {
  pointerId: number | null;
  startX: number;
  startY: number;
  dragStarted: boolean;
}

type DevTimerName = "idle.timeout" | "timer.drowsyToNap" | "timer.roaming.tick" | "unknown";

interface DevTimerRegistryEntry {
  handle: number;
  name: DevTimerName;
  timeoutMs: number;
  startedAtMs: number;
  dueAtMs: number;
}

interface DevTimerViewItem {
  handle: number;
  name: DevTimerName;
  timeoutMs: number;
  remainingMs: number;
}

interface DevDockWindowBaseSize {
  width: number;
  height: number;
}

interface DialogTransitionSession {
  previousCompactIgnoreCursorEvents: boolean;
  startedAt: number;
}

type DialogUiOpenSource = "stateMachine" | "devMock";
type RequestDialogCloseSource = "user" | "bridge";

interface RequestDialogCloseOptions {
  reason?: DialogCloseReason;
  dispatchStateEvent?: boolean;
  source?: RequestDialogCloseSource;
}

function isDialogClosingPhase(phase: DialogTransitionPhase): boolean {
  return phase === "closing.messages" || phase === "closing.shell" || phase === "closing.window";
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveDevTimerName(timeoutMs: number): DevTimerName {
  const {
    idleTimeoutMs,
    drowsyToNapMs,
    roamingMinMs,
    roamingMaxMs,
  } = petBehaviorConfig.stateTimers;

  if (timeoutMs === idleTimeoutMs && timeoutMs !== drowsyToNapMs) {
    return "idle.timeout";
  }
  if (timeoutMs === drowsyToNapMs && timeoutMs !== idleTimeoutMs) {
    return "timer.drowsyToNap";
  }
  if (timeoutMs >= roamingMinMs && timeoutMs <= roamingMaxMs) {
    return "timer.roaming.tick";
  }
  if (timeoutMs === idleTimeoutMs) {
    return "idle.timeout";
  }
  if (timeoutMs === drowsyToNapMs) {
    return "timer.drowsyToNap";
  }
  return "unknown";
}

function createDevTrackedTimerBackend(
  registryRef: { current: Map<number, DevTimerRegistryEntry> },
): TimerBackend {
  return {
    setTimeout: (handler, timeoutMs) => {
      const startedAtMs = nowMs();
      const safeTimeoutMs = Math.max(0, timeoutMs);
      let handle = -1;
      handle = window.setTimeout(() => {
        registryRef.current.delete(handle);
        handler();
      }, safeTimeoutMs);
      registryRef.current.set(handle, {
        handle,
        name: resolveDevTimerName(safeTimeoutMs),
        timeoutMs: safeTimeoutMs,
        startedAtMs,
        dueAtMs: startedAtMs + safeTimeoutMs,
      });
      return handle;
    },
    clearTimeout: (handle) => {
      window.clearTimeout(handle);
      registryRef.current.delete(handle);
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveTargetX(rawTargetX: number | undefined, minX: number, maxX: number): number {
  const span = Math.max(0, maxX - minX);

  if (typeof rawTargetX !== "number" || !Number.isFinite(rawTargetX)) {
    return minX + span * TARGETED_DEFAULT_WORKAREA_X;
  }

  if (rawTargetX >= minX && rawTargetX <= maxX) {
    return rawTargetX;
  }

  // Support normalized targets in [0, 1].
  if (rawTargetX >= 0 && rawTargetX <= 1) {
    return minX + span * rawTargetX;
  }

  // Support direction-only targets in (-1, 1).
  if (rawTargetX > -1 && rawTargetX < 1) {
    if (Math.abs(rawTargetX) < 0.001) {
      return minX + span * 0.5;
    }
    return rawTargetX > 0 ? maxX : minX;
  }

  return clamp(rawTargetX, minX, maxX);
}

function createInitialWindowMovementRuntime(): WindowMovementRuntime {
  return {
    mode: "none",
    direction: 1,
    requestId: null,
    targetX: null,
    minX: 0,
    maxX: 0,
    posX: 0,
    posY: 0,
    lastTickAtMs: null,
    isRefreshingBounds: false,
    isSettingPosition: false,
    queuedPosition: null,
    arrivalDispatchedRequestId: null,
  };
}

function createInitialHitboxPointerGesture(): HitboxPointerGesture {
  return {
    pointerId: null,
    startX: 0,
    startY: 0,
    dragStarted: false,
  };
}

function App() {
  const appWindowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);
  if (appWindowRef.current === null) {
    appWindowRef.current = getCurrentWindow();
  }
  const appWindow = appWindowRef.current;
  const devTimerRegistryRef = useRef<Map<number, DevTimerRegistryEntry>>(new Map());
  const devTimerBackendRef = useRef<TimerBackend | null>(null);
  const devDockBaseSizeRef = useRef<DevDockWindowBaseSize | null>(null);
  const devDockResizeInFlightRef = useRef(false);
  if (IS_DEV_BUILD && devTimerBackendRef.current === null) {
    devTimerBackendRef.current = createDevTrackedTimerBackend(devTimerRegistryRef);
  }

  const machineRef = useRef<PetStateMachine>(
    new PetStateMachine(IS_DEV_BUILD && devTimerBackendRef.current
      ? { timerBackend: devTimerBackendRef.current }
      : undefined),
  );
  const machineReadyRef = useRef(false);
  const allowWindowCloseRef = useRef(false);
  const pendingExitRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const closeUnlistenRef = useRef<(() => void) | null>(null);
  const machineUnsubscribeRef = useRef<(() => void) | null>(null);
  const isClickThroughRef = useRef(false);
  const toggleInFlightRef = useRef(false);
  const lastShortcutAtRef = useRef(0);
  const lastDialogShortcutAtRef = useRef(0);
  const lastDevPanelShortcutAtRef = useRef(0);
  const statusTimerRef = useRef<number | null>(null);
  const movementTickTimerRef = useRef<number | null>(null);
  const movementRuntimeRef = useRef<WindowMovementRuntime>(createInitialWindowMovementRuntime());
  const hitboxPointerGestureRef = useRef<HitboxPointerGesture>(createInitialHitboxPointerGesture());
  const suppressPatClickRef = useRef(false);
  const isDevPanelOpenRef = useRef(false);
  const petHitboxRef = useRef<HTMLDivElement | null>(null);
  const talkingInteractionRef = useRef<TalkingInteractionHandle | null>(null);
  const dialogTransitionTokenRef = useRef(0);
  const dialogModeActiveRef = useRef(false);
  const dialogOpenedFromRef = useRef<DialogUiOpenSource | null>(null);
  const pendingDialogUiOpenRef = useRef(false);
  const dialogClosingInProgressRef = useRef(false);
  const dialogBridgeUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const dialogTransitionSessionRef = useRef<DialogTransitionSession | null>(null);
  const dialogTransitionPhaseRef = useRef<DialogTransitionPhase>("compact");
  const dialogCloseWindowSnapInFlightRef = useRef(false);
  const dialogAnchorTransitionEnabledRef = useRef(true);
  const dialogCloseReasonRef = useRef<DialogCloseReason>("user");
  const ignorePatUntilMsRef = useRef(0);
  const dialogMovementResumeAtMsRef = useRef(0);

  const [isClickThrough, setIsClickThrough] = useState(false);
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [devSnapshot, setDevSnapshot] = useState<StateMachineSnapshot | null>(null);
  const [devPanelNowMs, setDevPanelNowMs] = useState(() => nowMs());
  const [devHungryInfo, setDevHungryInfo] = useState<{
    lastCsvImportDate: string | null;
    daysSinceFeed: number;
  } | null>(null);
  const [dialogRequestedOpen, setDialogRequestedOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  const showStatus = useCallback((message: string, durationMs: number = STATUS_HIDE_MS) => {
    setStatus(message);
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }

    statusTimerRef.current = window.setTimeout(() => {
      statusTimerRef.current = null;
      setStatus(null);
    }, durationMs);
  }, []);

  const setDevPanelOpenState = useCallback((nextOpen: boolean) => {
    isDevPanelOpenRef.current = nextOpen;
    setIsDevPanelOpen(nextOpen);
  }, []);

  const toggleDevPanel = useCallback(() => {
    setDevPanelOpenState(!isDevPanelOpenRef.current);
  }, [setDevPanelOpenState]);

  const devTimerItems = useMemo<DevTimerViewItem[]>(() => {
    if (!IS_DEV_BUILD) {
      return [];
    }

    const next: DevTimerViewItem[] = [];
    for (const entry of devTimerRegistryRef.current.values()) {
      next.push({
        handle: entry.handle,
        name: entry.name,
        timeoutMs: entry.timeoutMs,
        remainingMs: Math.max(0, Math.round(entry.dueAtMs - devPanelNowMs)),
      });
    }
    next.sort((a, b) => a.remainingMs - b.remainingMs);
    return next;
  }, [devPanelNowMs]);

  const devPanelDockPaddingRightPx = IS_DEV_BUILD && isDevPanelOpen && !dialogMounted
    ? DEV_PANEL_DOCK_WIDTH_PX + DEV_PANEL_DOCK_GAP_PX
    : 0;

  useEffect(() => {
    const geometryValid = isCompactDialogGeometryValid();
    if (!geometryValid) {
      assertCompactDialogGeometry();
    }
    dialogAnchorTransitionEnabledRef.current = geometryValid;
  }, []);

  const dispatch = useCallback((event: PetEvent) => {
    if (!machineReadyRef.current) {
      return;
    }
    machineRef.current.dispatch(event);
  }, []);

  useDragDropFeed({
    dispatch: (event) => dispatch(event as PetEvent),
    showStatus,
    isEnabled: () => !dialogModeActiveRef.current,
  });

  const queueWindowPosition = useCallback(
    (x: number, y: number) => {
      const runtime = movementRuntimeRef.current;
      runtime.queuedPosition = {
        x: Math.round(x),
        y: Math.round(y),
      };

      if (runtime.isSettingPosition) {
        return;
      }

      const flush = async () => {
        runtime.isSettingPosition = true;
        try {
          while (runtime.queuedPosition) {
            const next = runtime.queuedPosition;
            runtime.queuedPosition = null;
            await appWindow.setPosition(new PhysicalPosition(next.x, next.y));
          }
        } catch (error) {
          console.error("Failed to set window position:", error);
        } finally {
          runtime.isSettingPosition = false;
        }
      };

      void flush();
    },
    [],
  );

  const refreshWindowMovementBounds = useCallback(async () => {
    const runtime = movementRuntimeRef.current;
    if (runtime.isRefreshingBounds) {
      return;
    }

    runtime.isRefreshingBounds = true;
    try {
      const [monitor, outerPosition, outerSize] = await Promise.all([
        currentMonitor(),
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ]);

      if (!monitor) {
        return;
      }

      const workArea = monitor.workArea;
      const rawMinX = workArea.position.x + WINDOW_EDGE_PADDING_PX;
      const rawMaxX = workArea.position.x + workArea.size.width - outerSize.width - WINDOW_EDGE_PADDING_PX;
      const rawMinY = workArea.position.y + WINDOW_EDGE_PADDING_PX;
      const rawMaxY = workArea.position.y + workArea.size.height - outerSize.height - WINDOW_EDGE_PADDING_PX;

      const minX = Math.min(rawMinX, rawMaxX);
      const maxX = Math.max(rawMinX, rawMaxX);
      const minY = Math.min(rawMinY, rawMaxY);
      const maxY = Math.max(rawMinY, rawMaxY);

      const clampedX = clamp(outerPosition.x, minX, maxX);
      const clampedY = clamp(outerPosition.y, minY, maxY);

      runtime.minX = minX;
      runtime.maxX = maxX;
      runtime.posX = clampedX;
      runtime.posY = clampedY;

      if (clampedX !== outerPosition.x || clampedY !== outerPosition.y) {
        queueWindowPosition(clampedX, clampedY);
      }
    } catch (error) {
      console.error("Failed to refresh movement bounds:", error);
    } finally {
      runtime.isRefreshingBounds = false;
    }
  }, [queueWindowPosition]);

  const stopWindowMovementLoop = useCallback(() => {
    if (movementTickTimerRef.current !== null) {
      window.clearInterval(movementTickTimerRef.current);
      movementTickTimerRef.current = null;
    }

    const runtime = movementRuntimeRef.current;
    runtime.mode = "none";
    runtime.requestId = null;
    runtime.targetX = null;
    runtime.lastTickAtMs = null;
    runtime.arrivalDispatchedRequestId = null;
  }, []);

  const startWindowMovementLoop = useCallback(() => {
    if (movementTickTimerRef.current !== null) {
      return;
    }

    const runtime = movementRuntimeRef.current;
    runtime.lastTickAtMs = performance.now();

    movementTickTimerRef.current = window.setInterval(() => {
      const current = movementRuntimeRef.current;
      if (current.mode === "none") {
        if (movementTickTimerRef.current !== null) {
          window.clearInterval(movementTickTimerRef.current);
          movementTickTimerRef.current = null;
        }
        return;
      }

      const now = performance.now();
      const lastTickAtMs = current.lastTickAtMs ?? now;
      const deltaSec = Math.max(0, Math.min(0.06, (now - lastTickAtMs) / 1000));
      current.lastTickAtMs = now;

      if (current.mode === "roaming") {
        current.posX += current.direction * ROAMING_SPEED_PX_PER_SEC * deltaSec;

        if (current.direction > 0 && current.posX > current.maxX) {
          current.posX = current.minX;
        } else if (current.direction < 0 && current.posX < current.minX) {
          current.posX = current.maxX;
        }
      } else if (current.mode === "targeted" && current.targetX !== null) {
        const deltaX = current.targetX - current.posX;
        const step = TARGETED_SPEED_PX_PER_SEC * deltaSec;

        if (Math.abs(deltaX) <= TARGETED_ARRIVAL_THRESHOLD_PX || Math.abs(deltaX) <= step) {
          current.posX = current.targetX;

          if (
            current.requestId !== null &&
            current.arrivalDispatchedRequestId !== current.requestId
          ) {
            current.arrivalDispatchedRequestId = current.requestId;
            dispatch({
              type: "movement.arrive",
              requestId: current.requestId,
              position: {
                x: current.posX,
                y: current.posY,
              },
            });
          }

          current.mode = "none";
        } else {
          current.posX += Math.sign(deltaX) * step;
        }
      }

      current.posX = clamp(current.posX, current.minX, current.maxX);
      queueWindowPosition(current.posX, current.posY);
    }, WINDOW_MOVEMENT_TICK_MS);
  }, [dispatch, queueWindowPosition]);

  const syncWindowMovementFromState = useCallback(
    async (nextState: Readonly<PetFullState>) => {
      const now = performance.now();
      if (dialogModeActiveRef.current || now < dialogMovementResumeAtMsRef.current) {
        stopWindowMovementLoop();
        return;
      }

      if (nextState.lifecycle !== "alive") {
        stopWindowMovementLoop();
        return;
      }

      if (nextState.movement.state === "still") {
        stopWindowMovementLoop();
        return;
      }

      await refreshWindowMovementBounds();
      const runtime = movementRuntimeRef.current;
      runtime.direction = nextState.movement.direction === "left" ? -1 : 1;
      runtime.lastTickAtMs = performance.now();

      if (nextState.movement.state === "roaming") {
        runtime.mode = "roaming";
        runtime.requestId = null;
        runtime.targetX = null;
        runtime.arrivalDispatchedRequestId = null;
        startWindowMovementLoop();
        return;
      }

      runtime.mode = "targeted";
      runtime.requestId = nextState.movement.requestId;
      runtime.targetX = resolveTargetX(nextState.movement.target?.x, runtime.minX, runtime.maxX);
      if (runtime.requestId === null) {
        runtime.arrivalDispatchedRequestId = null;
      }
      startWindowMovementLoop();
    },
    [refreshWindowMovementBounds, startWindowMovementLoop, stopWindowMovementLoop],
  );

  const readWindowScaleFactor = useCallback(async () => {
    try {
      const scaleFactor = await appWindow.scaleFactor();
      if (Number.isFinite(scaleFactor) && scaleFactor > 0) {
        return scaleFactor;
      }
    } catch (error) {
      console.error("Failed to read window scale factor:", error);
    }
    return window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  }, [appWindow]);

  const setIgnoreCursorEventsSilently = useCallback(async (ignore: boolean) => {
    await invoke("set_ignore_cursor_events", { ignore });
    isClickThroughRef.current = ignore;
    setIsClickThrough(ignore);
  }, []);

  const finalizeDialogClose = useCallback(() => {
    dialogMovementResumeAtMsRef.current = performance.now() + DIALOG_MOVEMENT_RESUME_DELAY_MS;
    dialogModeActiveRef.current = false;
    dialogOpenedFromRef.current = null;
    dialogCloseReasonRef.current = "user";
    dialogTransitionSessionRef.current = null;
    dialogCloseWindowSnapInFlightRef.current = false;
    dialogClosingInProgressRef.current = false;
    setDialogMounted(false);
    setDialogVisible(false);
  }, []);

  const runDialogCloseWindowSnap = useCallback(async () => {
    if (dialogCloseWindowSnapInFlightRef.current) {
      return;
    }
    dialogCloseWindowSnapInFlightRef.current = true;
    const transitionToken = dialogTransitionTokenRef.current;

    try {
      const [outerPosition, scaleFactor] = await Promise.all([
        appWindow.outerPosition(),
        readWindowScaleFactor(),
      ]);
      if (dialogTransitionTokenRef.current !== transitionToken) {
        return;
      }

      const dialogLogicalPosition = {
        x: outerPosition.x / scaleFactor,
        y: outerPosition.y / scaleFactor,
      };
      const compactLogicalPosition = getCompactWindowPositionFromDialog(dialogLogicalPosition);
      const previousIgnore = dialogTransitionSessionRef.current?.previousCompactIgnoreCursorEvents ?? false;

      await Promise.all([
        appWindow.setSize(new LogicalSize(COMPACT_WINDOW.w, COMPACT_WINDOW.h)),
        appWindow.setPosition(
          new LogicalPosition(compactLogicalPosition.x, compactLogicalPosition.y),
        ),
        setIgnoreCursorEventsSilently(previousIgnore),
      ]);
    } catch (error) {
      console.error("Failed to close dialog window snap:", error);
      showStatus("Dialog close transition failed", 2200);
    } finally {
      dialogCloseWindowSnapInFlightRef.current = false;
    }
  }, [appWindow, readWindowScaleFactor, setIgnoreCursorEventsSilently, showStatus]);

  const runDialogOpenTransition = useCallback(async () => {
    const transitionToken = ++dialogTransitionTokenRef.current;

    if (dialogMounted) {
      dialogModeActiveRef.current = true;
      setDialogVisible(true);
      return;
    }

    stopWindowMovementLoop();
    dialogMovementResumeAtMsRef.current = 0;
    dialogCloseWindowSnapInFlightRef.current = false;
    if (!dialogTransitionSessionRef.current) {
      dialogTransitionSessionRef.current = {
        previousCompactIgnoreCursorEvents: isClickThroughRef.current,
        startedAt: Date.now(),
      };
    }

    try {
      const [outerPosition, scaleFactor] = await Promise.all([
        appWindow.outerPosition(),
        readWindowScaleFactor(),
      ]);
      if (dialogTransitionTokenRef.current !== transitionToken) {
        return;
      }

      if (dialogAnchorTransitionEnabledRef.current) {
        const compactLogicalPosition = {
          x: outerPosition.x / scaleFactor,
          y: outerPosition.y / scaleFactor,
        };
        const dialogLogicalPosition = getDialogWindowPositionFromCompact(compactLogicalPosition);

        try {
          await Promise.all([
            setIgnoreCursorEventsSilently(false),
            appWindow.setSize(new LogicalSize(DIALOG_WINDOW.w, DIALOG_WINDOW.h)),
            appWindow.setPosition(
              new LogicalPosition(dialogLogicalPosition.x, dialogLogicalPosition.y),
            ),
          ]);
        } catch (error) {
          console.error("Parallel open snap failed, retrying serial:", error);
          await setIgnoreCursorEventsSilently(false);
          await appWindow.setSize(new LogicalSize(DIALOG_WINDOW.w, DIALOG_WINDOW.h));
          await appWindow.setPosition(
            new LogicalPosition(dialogLogicalPosition.x, dialogLogicalPosition.y),
          );
        }
      } else {
        // Geometry drift fallback in production: keep old non-anchor open behavior.
        await setIgnoreCursorEventsSilently(false);
        await appWindow.setSize(new LogicalSize(DIALOG_WINDOW.w, DIALOG_WINDOW.h));
      }

      if (dialogTransitionTokenRef.current !== transitionToken) {
        return;
      }

      dialogModeActiveRef.current = true;
      setDialogMounted(true);
      setDialogVisible(true);
    } catch (error) {
      console.error("Failed to open dialog window:", error);
      showStatus("Dialog open transition failed", 2200);
    }
  }, [
    appWindow,
    dialogMounted,
    readWindowScaleFactor,
    setIgnoreCursorEventsSilently,
    showStatus,
    stopWindowMovementLoop,
  ]);

  const runDialogCloseTransition = useCallback(async () => {
    ++dialogTransitionTokenRef.current;

    if (!dialogMounted && !dialogVisible) {
      dialogModeActiveRef.current = false;
      dialogOpenedFromRef.current = null;
      dialogClosingInProgressRef.current = false;
      return;
    }

    setDialogVisible(false);
  }, [dialogMounted, dialogVisible]);

  const requestDialogOpen = useCallback((source: DialogUiOpenSource) => {
    const phase = dialogTransitionPhaseRef.current;
    if (isDialogClosingPhase(phase)) {
      return;
    }
    if (phase === "opening" || phase === "open" || phase === "measuring") {
      return;
    }

    const geometryValid = isCompactDialogGeometryValid();
    if (!geometryValid) {
      assertCompactDialogGeometry();
    }
    dialogAnchorTransitionEnabledRef.current = geometryValid;

    dialogTransitionSessionRef.current = {
      previousCompactIgnoreCursorEvents: isClickThroughRef.current,
      startedAt: Date.now(),
    };
    dialogOpenedFromRef.current = source;
    dialogCloseReasonRef.current = "user";
    setDialogRequestedOpen(true);
  }, []);

  const requestDialogOpenFromPhysicalEvent = useCallback((source: DialogOpenSource) => {
    if (!machineReadyRef.current) {
      return;
    }

    const snapshot = machineRef.current.getSnapshot().state;
    const route = routePhysicalEventToDialogOpen(
      snapshot,
      () => dialogModeActiveRef.current,
      source,
    );

    if (!route.shouldDispatch || !route.event) {
      return;
    }

    pendingDialogUiOpenRef.current = true;
    dispatch(route.event);
  }, [dispatch]);

  const requestDialogClose = useCallback((options: RequestDialogCloseOptions = {}) => {
    const {
      reason = "user",
      dispatchStateEvent = true,
      source = "user",
    } = options;

    if (!dialogModeActiveRef.current) {
      return;
    }

    if (dialogClosingInProgressRef.current) {
      return;
    }

    dialogClosingInProgressRef.current = true;
    dialogCloseReasonRef.current = reason;
    void source;

    if (dispatchStateEvent && machineReadyRef.current) {
      dispatch({ type: "dialog.close", reason });
    }

    setDialogRequestedOpen(false);
  }, [dispatch]);

  const handleDialogTransitionPhaseChange = useCallback((phase: DialogTransitionPhase) => {
    dialogTransitionPhaseRef.current = phase;
    if (phase === "compact" && !dialogRequestedOpen) {
      finalizeDialogClose();
    }
  }, [dialogRequestedOpen, finalizeDialogClose]);

  const handleDialogClosingWindowPhase = useCallback(async () => {
    await runDialogCloseWindowSnap();
  }, [runDialogCloseWindowSnap]);

  useEffect(() => {
    if (dialogRequestedOpen) {
      void runDialogOpenTransition();
      return;
    }
    void runDialogCloseTransition();
  }, [dialogRequestedOpen, runDialogCloseTransition, runDialogOpenTransition]);

  const setClickThrough = useCallback(
    async (ignore: boolean, emitStatus = true) => {
      await setIgnoreCursorEventsSilently(ignore);

      if (emitStatus) {
        showStatus(
          ignore
            ? "Click-through ON | Press Ctrl+Alt+P to interact"
            : "Click-through OFF | Dragging is available",
        );
      }
    },
    [setIgnoreCursorEventsSilently, showStatus],
  );

  const toggleClickThrough = useCallback(async () => {
    if (toggleInFlightRef.current) {
      return;
    }

    toggleInFlightRef.current = true;
    const nextState = !isClickThroughRef.current;

    try {
      await setClickThrough(nextState, true);
    } catch (error) {
      console.error("Failed to toggle click-through:", error);
      showStatus("Click-through toggle failed", 2600);
    } finally {
      toggleInFlightRef.current = false;
    }
  }, [setClickThrough, showStatus]);

  const handlePlayerReady = useCallback(
    (player: AnimationPlayer) => {
      const machine = machineRef.current;
      machine.init(player);

      machineUnsubscribeRef.current?.();
      machineUnsubscribeRef.current = machine.subscribe((nextState, snapshot) => {
        void syncWindowMovementFromState(nextState);
        if (
          (dialogModeActiveRef.current || performance.now() < dialogMovementResumeAtMsRef.current)
          && nextState.lifecycle === "alive"
          && nextState.major === "idle"
          && nextState.idleSub === "awake"
          && nextState.movement.state === "roaming"
        ) {
          machine.dispatch({ type: "timer.roaming.tick" });
        }

        if (
          pendingDialogUiOpenRef.current &&
          nextState.lifecycle === "alive" &&
          nextState.major === "talking" &&
          !dialogModeActiveRef.current
        ) {
          pendingDialogUiOpenRef.current = false;
          requestDialogOpen("stateMachine");
        }

        if (IS_DEV_BUILD) {
          setDevSnapshot(snapshot);
        }

        if (pendingExitRef.current && nextState.lifecycle === "deep_sleep") {
          allowWindowCloseRef.current = true;
          void appWindow.close();
        }
      });

      dialogBridgeUnsubscribeRef.current?.();
      dialogBridgeUnsubscribeRef.current = watchTalkingExitForDialogSync(
        machineRef.current,
        () => dialogModeActiveRef.current && !dialogClosingInProgressRef.current,
        () => {
          requestDialogClose({
            reason: "user",
            dispatchStateEvent: false,
            source: "bridge",
          });
        },
      );

      // TODO(Phase B): Load real values from SQLite PetContext.
      machine.start({
        isNewDay: false,
        lastExitClean: true,
      });
      if (IS_DEV_BUILD) {
        setDevSnapshot(machine.getSnapshot());
      }
      if (petBehaviorConfig.hungry.evaluateOnStartup) {
        void (async () => {
          try {
            const lastCsvImportDate = await PetContextService.getLastCsvImportDate();
            const nowDate = formatLocalDate(new Date());
            const { isHungry, daysSinceFeed } = decideHungry({
              lastCsvImportDate: lastCsvImportDate ?? "",
              nowDate,
              thresholdDays: petBehaviorConfig.hungry.thresholdDays,
            });

            if (IS_DEV_BUILD) {
              console.log(
                "[hungry] decided: isHungry=%s, daysSinceFeed=%d, threshold=%d, lastImport=%s",
                isHungry,
                daysSinceFeed,
                petBehaviorConfig.hungry.thresholdDays,
                lastCsvImportDate ?? "(never)",
              );
            }

            machine.dispatch({ type: "hungry.set", value: isHungry });
            setDevHungryInfo({ lastCsvImportDate, daysSinceFeed });

            if (IS_DEV_BUILD) {
              setDevSnapshot(machine.getSnapshot());
            }
          } catch (error) {
            console.error("[hungry] decision failed:", error);
          }
        })();
      }

      machineReadyRef.current = true;
      pendingExitRef.current = false;
      allowWindowCloseRef.current = false;
    },
    [requestDialogClose, requestDialogOpen, syncWindowMovementFromState],
  );

  const handlePatClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.detail !== 1) {
      return;
    }

    if (dialogModeActiveRef.current) {
      return;
    }

    if (suppressPatClickRef.current) {
      suppressPatClickRef.current = false;
      return;
    }

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      if (performance.now() < ignorePatUntilMsRef.current) {
        return;
      }
      if (dialogModeActiveRef.current) {
        return;
      }
      const snapshot = machineRef.current.getSnapshot().state;
      if (snapshot.lifecycle === "alive" && snapshot.major === "talking") {
        return;
      }
      dispatch({ type: "user.pat" });
    }, PAT_CLICK_DELAY_MS);
  }, [dispatch]);

  const handleDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (dialogModeActiveRef.current) {
      return;
    }

    if (suppressPatClickRef.current) {
      suppressPatClickRef.current = false;
      return;
    }

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    ignorePatUntilMsRef.current = performance.now()
      + Math.max(DOUBLE_CLICK_PAT_GUARD_MS, PAT_CLICK_DELAY_MS + 120);
    dispatch({ type: "user.doubleClick" });
    requestDialogOpenFromPhysicalEvent("doubleClick");
  }, [dispatch, requestDialogOpenFromPhysicalEvent]);

  const handleHitboxPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dialogModeActiveRef.current || !event.isPrimary || event.button !== 0 || isClickThroughRef.current) {
      return;
    }

    suppressPatClickRef.current = false;
    hitboxPointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragStarted: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleHitboxPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (dialogModeActiveRef.current) {
        return;
      }

      const gesture = hitboxPointerGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId || gesture.dragStarted) {
        return;
      }

      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < HITBOX_DRAG_START_THRESHOLD_PX * HITBOX_DRAG_START_THRESHOLD_PX) {
        return;
      }

      gesture.dragStarted = true;
      suppressPatClickRef.current = true;
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      void appWindow.startDragging().catch((error) => {
        console.error("Failed to start window drag:", error);
      });
    },
    [appWindow],
  );

  const handleHitboxPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dialogModeActiveRef.current) {
      return;
    }

    const gesture = hitboxPointerGestureRef.current;
    if (gesture.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    hitboxPointerGestureRef.current = createInitialHitboxPointerGesture();
  }, []);

  const handleHitboxPointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dialogModeActiveRef.current) {
      return;
    }

    const gesture = hitboxPointerGestureRef.current;
    if (gesture.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    hitboxPointerGestureRef.current = createInitialHitboxPointerGesture();
  }, []);

  const resolveDevReminderTarget = useCallback(() => {
    const runtime = movementRuntimeRef.current;
    const span = runtime.maxX - runtime.minX;
    if (Number.isFinite(span) && span > 0) {
      return {
        x: runtime.minX + span * TARGETED_DEFAULT_WORKAREA_X,
        y: runtime.posY,
      };
    }

    return {
      x: TARGETED_DEFAULT_WORKAREA_X,
      y: 0,
    };
  }, []);

  const handleDevForceDrowsy = useCallback(() => {
    dispatch({ type: "idle.timeout" });
  }, [dispatch]);

  const handleDevForceNapping = useCallback(() => {
    const state = machineRef.current.getSnapshot().state;
    if (state.lifecycle === "alive" && state.major === "idle" && state.idleSub === "napping") {
      return;
    }

    if (state.lifecycle === "alive" && state.major === "idle" && state.idleSub === "drowsy") {
      dispatch({ type: "timer.drowsyToNap" });
      return;
    }

    dispatch({ type: "idle.timeout" });
    dispatch({ type: "timer.drowsyToNap" });
  }, [dispatch]);

  const handleDevForceWakeFromNap = useCallback(() => {
    const state = machineRef.current.getSnapshot().state;
    if (!(state.lifecycle === "alive" && state.major === "idle" && state.idleSub === "napping")) {
      dispatch({ type: "idle.timeout" });
      dispatch({ type: "timer.drowsyToNap" });
    }
    dispatch({ type: "reminder.due", target: resolveDevReminderTarget() });
  }, [dispatch, resolveDevReminderTarget]);

  const handleDevForceDialogOpen = useCallback(() => {
    dispatch({ type: "dialog.open", source: "doubleClick" });
  }, [dispatch]);

  const handleDevForceDialogClose = useCallback(() => {
    dispatch({ type: "dialog.close", reason: "user" });
  }, [dispatch]);

  const handleDevForceDialogOpenFromDrowsy = useCallback(() => {
    dispatch({ type: "idle.timeout" });
    dispatch({ type: "dialog.open", source: "doubleClick" });
  }, [dispatch]);

  const handleDevForceDialogOpenFromNapping = useCallback(() => {
    dispatch({ type: "idle.timeout" });
    dispatch({ type: "timer.drowsyToNap" });
    dispatch({ type: "dialog.open", source: "doubleClick" });
  }, [dispatch]);

  const handleDevRoamingPulse = useCallback(() => {
    dispatch({ type: "timer.roaming.tick" });
  }, [dispatch]);

  const handleDevResetIdleAwake = useCallback(() => {
    if (!machineReadyRef.current) {
      return;
    }

    machineRef.current.start({
      isNewDay: false,
      lastExitClean: true,
    });
    if (IS_DEV_BUILD) {
      setDevSnapshot(machineRef.current.getSnapshot());
    }
  }, []);

  const handleDevInjectPat = useCallback(() => {
    dispatch({ type: "user.pat" });
  }, [dispatch]);

  const handleDevInjectFeed = useCallback(() => {
    const csv = new File(["date,title\n"], "dev-feed.csv", { type: "text/csv" });
    dispatch({ type: "user.feed", csv });
  }, [dispatch]);

  const handleDevInjectReminderDue = useCallback(() => {
    dispatch({ type: "reminder.due", target: resolveDevReminderTarget() });
  }, [dispatch, resolveDevReminderTarget]);

  const handleDevInjectExit = useCallback(() => {
    dispatch({ type: "user.exit" });
  }, [dispatch]);

  const handleDevInjectMovementArrive = useCallback(() => {
    const state = machineRef.current.getSnapshot().state;
    const requestId = state.movement.requestId;
    if (requestId === null) {
      showStatus("No active targeted_move request", 1800);
      return;
    }

    dispatch({
      type: "movement.arrive",
      requestId,
      position: {
        x: movementRuntimeRef.current.posX,
        y: movementRuntimeRef.current.posY,
      },
    });
  }, [dispatch, showStatus]);

  const handleDevToggleHungry = useCallback(() => {
    const nextIsHungry = !machineRef.current.getSnapshot().state.flags.isHungry;
    dispatch({ type: "hungry.set", value: nextIsHungry });
    if (IS_DEV_BUILD) {
      setDevSnapshot(machineRef.current.getSnapshot());
    }
  }, [dispatch]);

  const handleDevToggleClickThrough = useCallback(() => {
    void toggleClickThrough();
  }, [toggleClickThrough]);

  const openDialogFromDevMock = useCallback(() => {
    requestDialogOpenFromPhysicalEvent("doubleClick");
  }, [requestDialogOpenFromPhysicalEvent]);

  const handleDevOpenDialogMock = useCallback(() => {
    openDialogFromDevMock();
  }, [openDialogFromDevMock]);

  const handleDevAppendIchanMessage = useCallback(() => {
    if (!dialogRequestedOpen) {
      openDialogFromDevMock();
      window.setTimeout(() => {
        talkingInteractionRef.current?.appendMockIchanMessage();
      }, DIALOG_ANIMATION.durationMs + 40);
      return;
    }
    talkingInteractionRef.current?.appendMockIchanMessage();
  }, [dialogRequestedOpen, openDialogFromDevMock]);

  const handleDevAppendUserMessage = useCallback(() => {
    if (!dialogRequestedOpen) {
      openDialogFromDevMock();
      window.setTimeout(() => {
        talkingInteractionRef.current?.appendMockUserMessage();
      }, DIALOG_ANIMATION.durationMs + 40);
      return;
    }
    talkingInteractionRef.current?.appendMockUserMessage();
  }, [dialogRequestedOpen, openDialogFromDevMock]);

  const handleDevLongTextDemo = useCallback(() => {
    if (!dialogRequestedOpen) {
      openDialogFromDevMock();
      window.setTimeout(() => {
        talkingInteractionRef.current?.runLongTextDemo();
      }, DIALOG_ANIMATION.durationMs + 40);
      return;
    }
    talkingInteractionRef.current?.runLongTextDemo();
  }, [dialogRequestedOpen, openDialogFromDevMock]);

  const handleDevHistoryReviewDemo = useCallback(() => {
    if (!dialogRequestedOpen) {
      openDialogFromDevMock();
      window.setTimeout(() => {
        void talkingInteractionRef.current?.runHistoryReviewDemo();
      }, DIALOG_ANIMATION.durationMs + 40);
      return;
    }
    void talkingInteractionRef.current?.runHistoryReviewDemo();
  }, [dialogRequestedOpen, openDialogFromDevMock]);

  const handleDevCloseDialog = useCallback(() => {
    requestDialogClose({ reason: "user", dispatchStateEvent: true, source: "user" });
  }, [requestDialogClose]);

  useEffect(() => {
    let disposed = false;

    const setupShortcut = async () => {
      const setupErrors: string[] = [];

      try {
        await unregisterAll();
      } catch (error) {
        console.error("Failed to unregister previous shortcuts:", error);
        setupErrors.push("unregisterAll");
      }

      if (disposed) {
        return;
      }

      try {
        await setClickThrough(false, false);
      } catch (error) {
        console.error("Failed to reset click-through during setup:", error);
        setupErrors.push("clickThroughReset");
      }

      if (disposed) {
        return;
      }
      setDevPanelOpenState(false);

      const failedShortcuts: string[] = [];

      try {
        await register(CLICK_THROUGH_SHORTCUT, (event) => {
          if (disposed) {
            return;
          }

          const keyState = String(event.state ?? "").toLowerCase();
          if (keyState !== "pressed") {
            return;
          }

          const now = performance.now();
          if (now - lastShortcutAtRef.current < SHORTCUT_DEBOUNCE_MS) {
            return;
          }

          lastShortcutAtRef.current = now;
          void toggleClickThrough();
        });
      } catch (error) {
        console.error(`Failed to register shortcut ${CLICK_THROUGH_SHORTCUT}:`, error);
        failedShortcuts.push(CLICK_THROUGH_SHORTCUT);
      }

      try {
        await register(DIALOG_SHORTCUT, (event) => {
          if (disposed) {
            return;
          }

          const keyState = String(event.state ?? "").toLowerCase();
          if (keyState !== "pressed") {
            return;
          }

          const now = performance.now();
          if (now - lastDialogShortcutAtRef.current < SHORTCUT_DEBOUNCE_MS) {
            return;
          }

          lastDialogShortcutAtRef.current = now;
          requestDialogOpenFromPhysicalEvent("shortcut");
        });
      } catch (error) {
        console.error(`Failed to register shortcut ${DIALOG_SHORTCUT}:`, error);
        failedShortcuts.push(DIALOG_SHORTCUT);
      }

      if (IS_DEV_BUILD) {
        try {
          await register(DEV_PANEL_SHORTCUT, (event) => {
            if (disposed) {
              return;
            }

            const keyState = String(event.state ?? "").toLowerCase();
            if (keyState !== "pressed") {
              return;
            }

            const now = performance.now();
            if (now - lastDevPanelShortcutAtRef.current < SHORTCUT_DEBOUNCE_MS) {
              return;
            }

            lastDevPanelShortcutAtRef.current = now;
            toggleDevPanel();
          });
        } catch (error) {
          console.error(`Failed to register shortcut ${DEV_PANEL_SHORTCUT}:`, error);
          failedShortcuts.push(DEV_PANEL_SHORTCUT);
        }
      }

      if (failedShortcuts.length > 0) {
        showStatus(`Shortcut unavailable: ${failedShortcuts.join(", ")}`, 4200);
      }
      if (setupErrors.length > 0) {
        showStatus(`Shortcut setup partial failure: ${setupErrors.join(", ")}`, 4200);
      }
    };

    void setupShortcut();

    return () => {
      disposed = true;
      void unregisterAll();
      void invoke("set_ignore_cursor_events", { ignore: false }).catch(console.error);
      setDevPanelOpenState(false);
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, [
    requestDialogOpenFromPhysicalEvent,
    setClickThrough,
    setDevPanelOpenState,
    showStatus,
    toggleClickThrough,
    toggleDevPanel,
  ]);

  useEffect(() => {
    if (!IS_DEV_BUILD || !isDevPanelOpen) {
      return;
    }

    const handle = window.setInterval(() => {
      setDevPanelNowMs(nowMs());
    }, DEV_PANEL_TIMER_REFRESH_MS);

    return () => {
      window.clearInterval(handle);
    };
  }, [isDevPanelOpen]);

  useEffect(() => {
    if (!IS_DEV_BUILD) {
      return;
    }

    if (dialogMounted) {
      return;
    }

    if (devDockResizeInFlightRef.current) {
      return;
    }

    let disposed = false;

    const syncDockedWindowWidth = async () => {
      devDockResizeInFlightRef.current = true;
      try {
        const outerSize = await appWindow.outerSize();
        if (disposed) {
          return;
        }

        if (!devDockBaseSizeRef.current) {
          devDockBaseSizeRef.current = {
            width: outerSize.width,
            height: outerSize.height,
          };
        }
        const baseSize = devDockBaseSizeRef.current;

        const targetWidth = isDevPanelOpen
          ? baseSize.width + DEV_PANEL_DOCK_WIDTH_PX + DEV_PANEL_DOCK_GAP_PX
          : baseSize.width;
        const targetHeight = baseSize.height;

        if (outerSize.width === targetWidth && outerSize.height === targetHeight) {
          return;
        }

        await appWindow.setSize(new PhysicalSize(targetWidth, targetHeight));
      } catch (error) {
        console.error("Failed to sync dev panel dock window size:", error);
        showStatus("DevPanel dock resize failed", 1800);
      } finally {
        devDockResizeInFlightRef.current = false;
      }
    };

    void syncDockedWindowWidth();

    return () => {
      disposed = true;
    };
  }, [appWindow, dialogMounted, isDevPanelOpen, showStatus]);

  useEffect(() => {
    let disposed = false;

    const registerCloseHandler = async () => {
      try {
        const unlisten = await appWindow.onCloseRequested((event) => {
          if (allowWindowCloseRef.current || !machineReadyRef.current) {
            return;
          }

          event.preventDefault();
          pendingExitRef.current = true;
          dispatch({ type: "user.exit" });
        });

        if (disposed) {
          unlisten();
          return;
        }
        closeUnlistenRef.current = unlisten;
      } catch (error) {
        console.error("Failed to register close handler:", error);
      }
    };

    void registerCloseHandler();

    return () => {
      disposed = true;
      closeUnlistenRef.current?.();
      closeUnlistenRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      stopWindowMovementLoop();
      machineUnsubscribeRef.current?.();
      machineUnsubscribeRef.current = null;
      dialogBridgeUnsubscribeRef.current?.();
      dialogBridgeUnsubscribeRef.current = null;
      machineRef.current.destroy();
      machineReadyRef.current = false;
      isDevPanelOpenRef.current = false;
      setIsDevPanelOpen(false);
      devDockBaseSizeRef.current = null;
      devDockResizeInFlightRef.current = false;
      dialogModeActiveRef.current = false;
      dialogOpenedFromRef.current = null;
      dialogTransitionSessionRef.current = null;
      dialogTransitionPhaseRef.current = "compact";
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, [stopWindowMovementLoop]);

  return (
    <div
      className="pet-app-shell"
      style={devPanelDockPaddingRightPx > 0
        ? { paddingRight: `${devPanelDockPaddingRightPx}px`, boxSizing: "border-box" }
        : undefined}
    >
      <div
        ref={petHitboxRef}
        className={`pet-hitbox${dialogMounted ? " pet-hitbox--dialog" : ""}`}
        style={{ cursor: dialogMounted || isClickThrough ? "default" : "grab" }}
        onPointerDown={handleHitboxPointerDown}
        onPointerMove={handleHitboxPointerMove}
        onPointerUp={handleHitboxPointerUp}
        onPointerCancel={handleHitboxPointerCancel}
        onClick={handlePatClick}
        onDoubleClick={handleDoubleClick}
      >
        <TalkingInteraction
          ref={talkingInteractionRef}
          open={dialogMounted}
          visible={dialogVisible}
          onRequestClose={(reason) => requestDialogClose({ reason, dispatchStateEvent: true, source: "user" })}
          onTransitionPhaseChange={handleDialogTransitionPhaseChange}
          onClosingWindowPhase={handleDialogClosingWindowPhase}
        />
        <PetCanvas
          className="pet-canvas"
          mode={dialogMounted ? "dialog" : "default"}
          autoPreload
          displayHeightPx={dialogMounted ? DIALOG_PET_LAYOUT.height : COMPACT_PET_DISPLAY.h}
          onReady={handlePlayerReady}
        />
        {status ? <div className="pet-status">{status}</div> : null}
      </div>
      {IS_DEV_BUILD && DevPanelLazy ? (
        <Suspense fallback={null}>
          <DevPanelLazy
            visible={isDevPanelOpen}
            shortcut={DEV_PANEL_SHORTCUT}
            clickThroughShortcut={CLICK_THROUGH_SHORTCUT}
            dockWidthPx={DEV_PANEL_DOCK_WIDTH_PX}
            petState={devSnapshot?.state ?? null}
            machineSnapshot={devSnapshot}
            currentMoveRequestId={devSnapshot?.state.movement.requestId ?? null}
            lastCsvImportDate={devHungryInfo?.lastCsvImportDate ?? null}
            hungryThresholdDays={petBehaviorConfig.hungry.thresholdDays}
            hungryIsHungry={devSnapshot?.state.flags.isHungry ?? false}
            hungryDaysSinceFeed={devHungryInfo?.daysSinceFeed ?? 0}
            timerItems={devTimerItems}
            onClose={() => setDevPanelOpenState(false)}
            onForceDrowsy={handleDevForceDrowsy}
            onForceNapping={handleDevForceNapping}
            onForceWakeFromNap={handleDevForceWakeFromNap}
            onForceDialogOpen={handleDevForceDialogOpen}
            onForceDialogClose={handleDevForceDialogClose}
            onForceDialogOpenFromDrowsy={handleDevForceDialogOpenFromDrowsy}
            onForceDialogOpenFromNapping={handleDevForceDialogOpenFromNapping}
            onRoamingPulse={handleDevRoamingPulse}
            onResetIdleAwake={handleDevResetIdleAwake}
            onInjectPat={handleDevInjectPat}
            onInjectFeed={handleDevInjectFeed}
            onInjectReminderDue={handleDevInjectReminderDue}
            onInjectExit={handleDevInjectExit}
            onInjectMovementArrive={handleDevInjectMovementArrive}
            onToggleHungry={handleDevToggleHungry}
            onToggleClickThrough={handleDevToggleClickThrough}
            onOpenDialogMock={handleDevOpenDialogMock}
            onAppendIchanMessage={handleDevAppendIchanMessage}
            onAppendUserMessage={handleDevAppendUserMessage}
            onLongTextDemo={handleDevLongTextDemo}
            onHistoryReviewDemo={handleDevHistoryReviewDemo}
            onCloseDialog={handleDevCloseDialog}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
