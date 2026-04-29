import { petBehaviorConfig } from "../../config/petBehaviorConfig";

export const COMPACT_WINDOW = { w: 380, h: 290 } as const;

export const COMPACT_PET_DISPLAY = { w: 291, h: 180 } as const;

export const COMPACT_PET_ANCHOR_IN_WINDOW = {
  x: 44.5,
  y: 110,
  width: 291,
  height: 180,
} as const;

export const DIALOG_WINDOW = { w: 560, h: 360 } as const;

export const DIALOG_PET_DISPLAY = { w: 150, h: 136 } as const;

export const DIALOG_PET_ANCHOR_IN_WINDOW = {
  x: 54,
  y: 128,
  width: 150,
  height: 136,
} as const;

export interface AnchorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function getBoxCenter(box: AnchorBox): Point {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export function getDialogWindowPositionFromCompact(compactPos: Point): Point {
  return {
    x: compactPos.x + 61,
    y: compactPos.y + 4,
  };
}

export function getCompactWindowPositionFromDialog(dialogPos: Point): Point {
  return {
    x: dialogPos.x - 61,
    y: dialogPos.y - 4,
  };
}

export function getCompactDialogGeometryIssues(): string[] {
  const issues: string[] = [];

  if (COMPACT_WINDOW.w !== 380 || COMPACT_WINDOW.h !== 290) {
    issues.push(`compact window expected 380x290, got ${COMPACT_WINDOW.w}x${COMPACT_WINDOW.h}`);
  }

  if (COMPACT_PET_DISPLAY.w !== 291 || COMPACT_PET_DISPLAY.h !== 180) {
    issues.push(
      `compact pet display expected 291x180, got ${COMPACT_PET_DISPLAY.w}x${COMPACT_PET_DISPLAY.h}`,
    );
  }

  if (DIALOG_WINDOW.w !== 560 || DIALOG_WINDOW.h !== 360) {
    issues.push(`dialog window expected 560x360, got ${DIALOG_WINDOW.w}x${DIALOG_WINDOW.h}`);
  }

  if (DIALOG_PET_DISPLAY.w !== 150 || DIALOG_PET_DISPLAY.h !== 136) {
    issues.push(`dialog pet display expected 150x136, got ${DIALOG_PET_DISPLAY.w}x${DIALOG_PET_DISPLAY.h}`);
  }

  const compactPetDisplayHeightPx = petBehaviorConfig.ui.petDisplayHeightPx;
  if (compactPetDisplayHeightPx !== COMPACT_PET_DISPLAY.h) {
    issues.push(
      `petBehaviorConfig.ui.petDisplayHeightPx expected ${COMPACT_PET_DISPLAY.h}, got ${compactPetDisplayHeightPx}`,
    );
  }

  return issues;
}

export function isCompactDialogGeometryValid(): boolean {
  return getCompactDialogGeometryIssues().length === 0;
}

export function assertCompactDialogGeometry(): void {
  const issues = getCompactDialogGeometryIssues();
  if (issues.length === 0) {
    return;
  }

  const error = new Error(`Compact/dialog geometry drift detected: ${issues.join("; ")}`);
  if (import.meta.env.DEV) {
    throw error;
  }

  console.error(error);
}
