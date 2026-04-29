import {
  DIALOG_PET_ANCHOR_IN_WINDOW,
  DIALOG_PET_DISPLAY,
  DIALOG_WINDOW,
  getBoxCenter,
} from "./dialog-transition";

export const DIALOG_APPLE_EASING = "cubic-bezier(0.32, 0.72, 0, 1)" as const;

export const DIALOG_TRANSITION = {
  openingMs: 320,
  closingMessagesMs: 180,
  closingShellMs: 220,
  windowSnapFrameMs: 16,
  easing: DIALOG_APPLE_EASING,
} as const;

// Backward-compatible alias used by existing demo helpers.
export const DIALOG_ANIMATION = {
  durationMs: DIALOG_TRANSITION.openingMs,
  easing: DIALOG_TRANSITION.easing,
  scaleFrom: 0.72,
  transformOrigin: `${getBoxCenter(DIALOG_PET_ANCHOR_IN_WINDOW).x}px ${getBoxCenter(DIALOG_PET_ANCHOR_IN_WINDOW).y}px`,
} as const;

export const DIALOG_SIZE = {
  width: DIALOG_WINDOW.w,
  height: DIALOG_WINDOW.h,
} as const;

export const DIALOG_PET_LAYOUT = {
  left: DIALOG_PET_ANCHOR_IN_WINDOW.x,
  top: DIALOG_PET_ANCHOR_IN_WINDOW.y,
  width: DIALOG_PET_DISPLAY.w,
  height: DIALOG_PET_DISPLAY.h,
} as const;

export const DIALOG_STAGE_LAYOUT = {
  left: 198,
  top: 62,
  width: 322,
  maxHeight: 220,
  bubbleMaxWidth: 260,
  bubbleMinWidth: 120,
  bubbleMaxHeight: 132,
} as const;

export const ACTIVE_MESSAGE_FADE = {
  delayMs: 4500,
  durationMs: 220,
  preserveLatestCount: 1,
} as const;

export const HISTORY_REVIEW = {
  pageSize: 30,
  fallbackThreshold: 5,
} as const;
