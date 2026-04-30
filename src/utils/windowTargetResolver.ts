import type { Coord } from "../components/Pet/types";
import { petBehaviorConfig } from "../config/petBehaviorConfig";

export interface WorkareaBounds {
  minX: number;
  maxX: number;
  posY: number;
}

const DEFAULT_TARGET_RATIO = petBehaviorConfig.windowMovement.targetedDefaultWorkareaX;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function resolveReminderTarget(bounds: WorkareaBounds | null): Coord {
  if (bounds
    && isFiniteNumber(bounds.minX)
    && isFiniteNumber(bounds.maxX)
    && isFiniteNumber(bounds.posY)
  ) {
    const minX = Math.min(bounds.minX, bounds.maxX);
    const maxX = Math.max(bounds.minX, bounds.maxX);
    const span = maxX - minX;
    if (span > 0) {
      return {
        x: minX + span * DEFAULT_TARGET_RATIO,
        y: bounds.posY,
      };
    }
    return {
      x: minX,
      y: bounds.posY,
    };
  }

  return {
    x: DEFAULT_TARGET_RATIO,
    y: 0,
  };
}
