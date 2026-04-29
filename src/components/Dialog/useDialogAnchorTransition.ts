import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import {
  DIALOG_PET_ANCHOR_IN_WINDOW,
  getBoxCenter,
} from "./dialog-transition";
import { DIALOG_TRANSITION } from "./dialog-tokens";
import type { DialogTransitionPhase } from "./dialog-types";

interface UseDialogAnchorTransitionInput {
  open: boolean;
  isDialogRequestedOpen: boolean;
  measureSignal?: number;
  onAfterOpen?: () => void;
  onAfterClose?: () => void;
  onClosingWindowPhase?: () => Promise<void> | void;
  onPhaseChange?: (phase: DialogTransitionPhase) => void;
}

interface UseDialogAnchorTransitionOutput {
  phase: DialogTransitionPhase;
  rootRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLDivElement | null>;
  dialogStyleVars: CSSProperties;
  requestRemeasure: () => void;
}

const DEFAULT_REVEAL_RADIUS = 680;
const REVEAL_SCALE_FROM = 0.72;

interface CachedRect {
  width: number;
  height: number;
}

function isClosingPhase(phase: DialogTransitionPhase): boolean {
  return phase === "closing.messages" || phase === "closing.shell" || phase === "closing.window";
}

export function useDialogAnchorTransition({
  open,
  isDialogRequestedOpen,
  measureSignal,
  onAfterOpen,
  onAfterClose,
  onClosingWindowPhase,
  onPhaseChange,
}: UseDialogAnchorTransitionInput): UseDialogAnchorTransitionOutput {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Callback refs — keeps external callbacks out of useCallback dep arrays so that
  // inline functions passed by callers don't cause cascading effect re-runs.
  const onAfterOpenRef = useRef(onAfterOpen);
  const onAfterCloseRef = useRef(onAfterClose);
  const onClosingWindowPhaseRef = useRef(onClosingWindowPhase);
  const onPhaseChangeRef = useRef(onPhaseChange);
  onAfterOpenRef.current = onAfterOpen;
  onAfterCloseRef.current = onAfterClose;
  onClosingWindowPhaseRef.current = onClosingWindowPhase;
  onPhaseChangeRef.current = onPhaseChange;

  const [phaseState, setPhaseState] = useState<DialogTransitionPhase>("compact");
  const phaseRef = useRef<DialogTransitionPhase>("compact");
  const pendingOpenRef = useRef(false);

  const openingTimerRef = useRef<number | null>(null);
  const closingTimersRef = useRef<number[]>([]);
  const closingTokenRef = useRef(0);
  const rafOneRef = useRef<number | null>(null);
  const rafTwoRef = useRef<number | null>(null);

  const rectCacheRef = useRef<Map<string, CachedRect>>(new Map());
  const [revealRadius, setRevealRadius] = useState(DEFAULT_REVEAL_RADIUS);

  // Stable: reads onPhaseChange via ref, no external dep.
  const setPhase = useCallback((next: DialogTransitionPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
    onPhaseChangeRef.current?.(next);
  }, []);

  const clearOpeningTimer = useCallback(() => {
    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
  }, []);

  const clearClosingTimers = useCallback(() => {
    for (const handle of closingTimersRef.current) {
      window.clearTimeout(handle);
    }
    closingTimersRef.current = [];
  }, []);

  const cancelMeasureFrames = useCallback(() => {
    if (rafOneRef.current !== null) {
      window.cancelAnimationFrame(rafOneRef.current);
      rafOneRef.current = null;
    }
    if (rafTwoRef.current !== null) {
      window.cancelAnimationFrame(rafTwoRef.current);
      rafTwoRef.current = null;
    }
  }, []);

  const listRevealItems = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      return [] as HTMLElement[];
    }
    return Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-item='true']"));
  }, []);

  const updateRevealRadius = useCallback((anchorX: number, anchorY: number) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const corners = [
      [rootRect.left, rootRect.top],
      [rootRect.right, rootRect.top],
      [rootRect.left, rootRect.bottom],
      [rootRect.right, rootRect.bottom],
    ] as const;

    const maxDistance = corners.reduce((acc, [x, y]) => {
      const distance = Math.hypot(anchorX - x, anchorY - y);
      return Math.max(acc, distance);
    }, 0);

    setRevealRadius(Math.max(DEFAULT_REVEAL_RADIUS, Math.ceil(maxDistance + 24)));
  }, []);

  const applyRevealOffsets = useCallback((targets: HTMLElement[]) => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const anchorX = anchorRect.left + anchorRect.width / 2;
    const anchorY = anchorRect.top + anchorRect.height / 2;
    updateRevealRadius(anchorX, anchorY);

    for (const node of targets) {
      const rect = node.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const offsetX = anchorX - centerX;
      const offsetY = anchorY - centerY;
      node.style.setProperty("--reveal-from-x", `${offsetX.toFixed(2)}px`);
      node.style.setProperty("--reveal-from-y", `${offsetY.toFixed(2)}px`);
      const key = node.dataset.revealKey;
      if (key) {
        rectCacheRef.current.set(key, { width: rect.width, height: rect.height });
      }
    }
  }, [updateRevealRadius]);

  // Stable: all deps (applyRevealOffsets, cancelMeasureFrames, clearOpeningTimer,
  // listRevealItems, setPhase) are themselves stable. onAfterOpen read via ref.
  const runMeasurePass = useCallback((initialMeasure: boolean) => {
    cancelMeasureFrames();

    const allItems = listRevealItems();
    if (allItems.length === 0) {
      if (initialMeasure) {
        setPhase("compact");
        if (pendingOpenRef.current) {
          pendingOpenRef.current = false;
          clearOpeningTimer();
          setPhase("opening");
          openingTimerRef.current = window.setTimeout(() => {
            openingTimerRef.current = null;
            setPhase("open");
            onAfterOpenRef.current?.();
          }, DIALOG_TRANSITION.openingMs);
        }
      }
      return;
    }

    const targetSet = new Set<HTMLElement>();
    if (initialMeasure) {
      for (const node of allItems) {
        targetSet.add(node);
      }
    } else {
      for (const node of allItems) {
        const key = node.dataset.revealKey;
        if (!key) {
          continue;
        }
        const prev = rectCacheRef.current.get(key);
        const rect = node.getBoundingClientRect();
        if (!prev || Math.abs(prev.width - rect.width) > 0.5 || Math.abs(prev.height - rect.height) > 0.5) {
          targetSet.add(node);
        }
      }
    }

    const targets = Array.from(targetSet);
    if (targets.length === 0) {
      return;
    }

    for (const node of targets) {
      node.dataset.revealMeasuring = "true";
    }

    rafOneRef.current = window.requestAnimationFrame(() => {
      rafOneRef.current = null;
      applyRevealOffsets(targets);

      rafTwoRef.current = window.requestAnimationFrame(() => {
        rafTwoRef.current = null;
        for (const node of targets) {
          delete node.dataset.revealMeasuring;
        }

        if (!initialMeasure) {
          return;
        }

        setPhase("compact");
        if (pendingOpenRef.current) {
          pendingOpenRef.current = false;
          clearOpeningTimer();
          setPhase("opening");
          openingTimerRef.current = window.setTimeout(() => {
            openingTimerRef.current = null;
            setPhase("open");
            onAfterOpenRef.current?.();
          }, DIALOG_TRANSITION.openingMs);
        }
      });
    });
  }, [
    applyRevealOffsets,
    cancelMeasureFrames,
    clearOpeningTimer,
    listRevealItems,
    setPhase,
  ]);

  const requestRemeasure = useCallback(() => {
    if (!open || phaseRef.current === "measuring") {
      return;
    }
    if (
      phaseRef.current !== "opening"
      && phaseRef.current !== "open"
      && phaseRef.current !== "closing.messages"
    ) {
      return;
    }
    runMeasurePass(false);
  }, [open, runMeasurePass]);

  // Stable: onAfterClose and onClosingWindowPhase read via refs.
  const startClosing = useCallback(() => {
    clearOpeningTimer();
    clearClosingTimers();
    const closeToken = ++closingTokenRef.current;

    setPhase("closing.messages");

    const messagesHandle = window.setTimeout(() => {
      if (closingTokenRef.current !== closeToken) {
        return;
      }
      setPhase("closing.shell");

      const shellHandle = window.setTimeout(() => {
        if (closingTokenRef.current !== closeToken) {
          return;
        }

        setPhase("closing.window");
        Promise.resolve(onClosingWindowPhaseRef.current?.())
          .catch((error) => {
            console.error("closing.window side effect failed:", error);
          })
          .finally(() => {
            if (closingTokenRef.current !== closeToken) {
              return;
            }

            const windowHandle = window.setTimeout(() => {
              if (closingTokenRef.current !== closeToken) {
                return;
              }
              setPhase("compact");
              onAfterCloseRef.current?.();
            }, DIALOG_TRANSITION.windowSnapFrameMs);
            closingTimersRef.current.push(windowHandle);
          });
      }, DIALOG_TRANSITION.closingShellMs);

      closingTimersRef.current.push(shellHandle);
    }, DIALOG_TRANSITION.closingMessagesMs);

    closingTimersRef.current.push(messagesHandle);
  }, [clearClosingTimers, clearOpeningTimer, setPhase]);

  // Stable: onAfterOpen read via ref.
  const startOpening = useCallback(() => {
    clearClosingTimers();
    closingTokenRef.current += 1;
    clearOpeningTimer();

    setPhase("opening");
    openingTimerRef.current = window.setTimeout(() => {
      openingTimerRef.current = null;
      setPhase("open");
      onAfterOpenRef.current?.();
    }, DIALOG_TRANSITION.openingMs);
  }, [clearClosingTimers, clearOpeningTimer, setPhase]);

  // Runs only when open or isDialogRequestedOpen change (all function deps are now stable).
  useEffect(() => {
    if (!open) {
      pendingOpenRef.current = false;
      clearOpeningTimer();
      clearClosingTimers();
      cancelMeasureFrames();
      rectCacheRef.current.clear();
      setPhase("compact");
      return;
    }

    pendingOpenRef.current = isDialogRequestedOpen;
    clearOpeningTimer();
    clearClosingTimers();
    cancelMeasureFrames();
    rectCacheRef.current.clear();

    setPhase("measuring");
    runMeasurePass(true);
  }, [
    cancelMeasureFrames,
    clearClosingTimers,
    clearOpeningTimer,
    isDialogRequestedOpen,
    open,
    runMeasurePass,
    setPhase,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const phase = phaseRef.current;
    if (isDialogRequestedOpen) {
      if (phase === "measuring") {
        pendingOpenRef.current = true;
        return;
      }
      if (phase === "opening" || phase === "open" || isClosingPhase(phase)) {
        return;
      }
      pendingOpenRef.current = false;
      startOpening();
      return;
    }

    pendingOpenRef.current = false;
    if (phase === "opening" || phase === "open") {
      startClosing();
    }
  }, [isDialogRequestedOpen, open, startClosing, startOpening]);

  useEffect(() => {
    if (!open || typeof measureSignal !== "number") {
      return;
    }
    requestRemeasure();
  }, [measureSignal, open, requestRemeasure]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleResize = () => {
      requestRemeasure();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [open, requestRemeasure]);

  const anchorCenter = useMemo(() => getBoxCenter(DIALOG_PET_ANCHOR_IN_WINDOW), []);
  const dialogStyleVars = useMemo(() => ({
    "--dialog-anchor-x": `${anchorCenter.x}px`,
    "--dialog-anchor-y": `${anchorCenter.y}px`,
    "--dialog-reveal-radius": `${revealRadius}px`,
    "--dialog-transition-ms": `${DIALOG_TRANSITION.openingMs}ms`,
    "--dialog-opacity-ms": `${DIALOG_TRANSITION.openingMs}ms`,
    "--dialog-closing-messages-ms": `${DIALOG_TRANSITION.closingMessagesMs}ms`,
    "--dialog-closing-shell-ms": `${DIALOG_TRANSITION.closingShellMs}ms`,
    "--dialog-easing": DIALOG_TRANSITION.easing,
    "--reveal-scale-from": String(REVEAL_SCALE_FROM),
  } as CSSProperties), [anchorCenter.x, anchorCenter.y, revealRadius]);

  return {
    phase: phaseState,
    rootRef,
    anchorRef,
    dialogStyleVars,
    requestRemeasure,
  };
}

export default useDialogAnchorTransition;
