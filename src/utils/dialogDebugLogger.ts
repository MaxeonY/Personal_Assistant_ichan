const STORAGE_KEY = "ichan.b2_9.dialog.debug.logs";
const MAX_LOG_ENTRIES = 500;

let installed = false;
let sequence = 0;

type PlainObject = Record<string, unknown>;

interface DialogDebugLogEntry {
  seq: number;
  time: string;
  tag: string;
  payload?: string;
}

function serializeUnknown(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, current) => {
      if (current instanceof Error) {
        return {
          name: current.name,
          message: current.message,
          stack: current.stack,
        };
      }
      if (typeof current === "bigint") {
        return `${current.toString()}n`;
      }
      return current;
    });
  } catch {
    try {
      return String(value);
    } catch {
      return "[unserializable]";
    }
  }
}

function readEntries(): DialogDebugLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as DialogDebugLogEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function writeEntries(entries: DialogDebugLogEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage errors
  }
}

function appendEntry(tag: string, payload?: unknown): DialogDebugLogEntry {
  const entry: DialogDebugLogEntry = {
    seq: ++sequence,
    time: new Date().toISOString(),
    tag,
    payload: payload == null ? undefined : serializeUnknown(payload),
  };

  const entries = readEntries();
  entries.push(entry);
  while (entries.length > MAX_LOG_ENTRIES) {
    entries.shift();
  }
  writeEntries(entries);
  return entry;
}

export function clearDialogDebugLogs(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getDialogDebugLogsFromStorage(): DialogDebugLogEntry[] {
  return readEntries();
}

export function logDialogDebug(tag: string, payload?: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const entry = appendEntry(tag, payload);
  if (payload == null) {
    console.log(`[B2-9][${entry.seq}] ${tag}`);
    return;
  }
  console.log(`[B2-9][${entry.seq}] ${tag}`, payload);
}

export function replayDialogDebugLogsFromStorage(maxEntries = 120): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const entries = readEntries();
  if (entries.length === 0) {
    return;
  }

  const sliceStart = Math.max(0, entries.length - Math.max(1, maxEntries));
  const tail = entries.slice(sliceStart);
  console.groupCollapsed(`[B2-9] Replayed ${tail.length}/${entries.length} previous debug logs`);
  for (const entry of tail) {
    if (entry.payload == null) {
      console.log(`[B2-9][prev:${entry.seq}] ${entry.time} ${entry.tag}`);
    } else {
      console.log(`[B2-9][prev:${entry.seq}] ${entry.time} ${entry.tag} ${entry.payload}`);
    }
  }
  console.groupEnd();
}

export function installDialogDebugGuards(extraContext?: PlainObject): void {
  if (!import.meta.env.DEV || installed) {
    return;
  }
  installed = true;

  logDialogDebug("debug.guards.install", extraContext);

  window.addEventListener("error", (event) => {
    logDialogDebug("window.error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logDialogDebug("window.unhandledrejection", {
      reason: event.reason,
    });
  });

  window.addEventListener("beforeunload", () => {
    logDialogDebug("window.beforeunload");
  });
}
