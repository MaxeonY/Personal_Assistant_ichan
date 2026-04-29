import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FEED_COPY } from "../config/petCopy";
import { PetContextService } from "../services/PetContextService";
import { workoutService } from "../services/WorkoutService";

const CSV_FEED_TOAST_MS = 2400;

type FeedDispatchEvent =
  | { type: "user.feed"; csv: File }
  | { type: "hungry.set"; value: boolean };

interface UseDragDropFeedOptions {
  dispatch: (event: FeedDispatchEvent) => void;
  showStatus: (message: string, durationMs?: number) => void;
  isEnabled?: () => boolean;
}

export function useDragDropFeed({ dispatch, showStatus, isEnabled }: UseDragDropFeedOptions): void {
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") {
          return;
        }

        if (isEnabledRef.current && !isEnabledRef.current()) {
          return;
        }

        const filePath = event.payload.paths[0];
        if (!filePath) {
          return;
        }

        const filename = filePath.split(/[\\/]/).pop() ?? "feed.csv";
        if (!filename.toLowerCase().endsWith(".csv")) {
          showStatus(FEED_COPY.notCsv(), CSV_FEED_TOAST_MS);
          return;
        }

        dispatch({
          type: "user.feed",
          csv: new File([], filename, { type: "text/csv" }),
        });

        if (import.meta.env.DEV) {
          console.log("[feed] drag_drop importCSV:", filePath);
        }

        void (async () => {
          try {
            const output = await workoutService.importCSV(filePath);
            const { result } = output;

            if (result.error) {
              showStatus(resolveFailureMessage(result.error), CSV_FEED_TOAST_MS);
              return;
            }

            try {
              await PetContextService.setLastCsvImportDate(formatLocalDate(new Date()));
            } catch (error) {
              console.error("[feed] Failed to persist lastCsvImportDate:", error);
            }

            dispatch({ type: "hungry.set", value: false });
            showStatus(resolveSuccessMessage(result.sessionsAdded, result.duplicatesSkipped), CSV_FEED_TOAST_MS);
          } catch (error) {
            console.error("[feed] importCSV unexpected error:", error);
            showStatus(FEED_COPY.parseFail(), CSV_FEED_TOAST_MS);
          }
        })();
      })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      })
      .catch((error) => {
        console.error("[feed] onDragDropEvent registration failed:", error);
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [dispatch, showStatus]);
}

function resolveFailureMessage(rawError: string): string {
  const error = rawError.toLowerCase();
  if (error.includes("empty") || error.includes("no valid rows")) {
    return FEED_COPY.empty();
  }
  if (
    error.includes("failed to read")
    || error.includes("io")
    || error.includes("read")
    || error.includes("open")
  ) {
    return FEED_COPY.ioError();
  }
  if (
    error.includes("failed to parse")
    || error.includes("header")
    || error.includes("field")
    || error.includes("row")
  ) {
    return FEED_COPY.parseFail();
  }
  return FEED_COPY.parseFail();
}

function resolveSuccessMessage(sessionsAdded: number, duplicatesSkipped: number): string {
  if (sessionsAdded > 1) {
    return FEED_COPY.successMulti(sessionsAdded);
  }
  if (sessionsAdded === 1) {
    return FEED_COPY.successSingle();
  }
  if (duplicatesSkipped > 0) {
    return FEED_COPY.duplicate();
  }
  return FEED_COPY.empty();
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
