import { invoke } from "@tauri-apps/api/core";
import type { SessionBootstrap } from "../components/Pet/types";

/**
 * PetContext persistence bridge.
 *
 * Current implementation stores PetContext fields in SQLite `config` key-value table.
 */
const KEY_LAST_CSV_IMPORT = "petcontext.lastCsvImportDate";
const KEY_LAST_EXIT_CLEAN = "petcontext.lastExitClean";
const KEY_LAST_SEEN_DATE = "petcontext.lastSeenDate";

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const PetContextService = {
  async getLastCsvImportDate(): Promise<string | null> {
    try {
      return await invoke<string | null>("config_get_value", {
        key: KEY_LAST_CSV_IMPORT,
      });
    } catch {
      return null;
    }
  },

  async setLastCsvImportDate(date: string): Promise<void> {
    await invoke("config_set_value", {
      key: KEY_LAST_CSV_IMPORT,
      value: date,
    });
  },

  async getLastExitClean(): Promise<boolean | null> {
    const raw = await invoke<string | null>("config_get_value", {
      key: KEY_LAST_EXIT_CLEAN,
    });
    if (raw == null) {
      return null;
    }
    return raw === "true";
  },

  async setLastExitClean(value: boolean): Promise<void> {
    await invoke("config_set_value", {
      key: KEY_LAST_EXIT_CLEAN,
      value: String(value),
    });
  },

  async getLastSeenDate(): Promise<string | null> {
    return await invoke<string | null>("config_get_value", {
      key: KEY_LAST_SEEN_DATE,
    });
  },

  async setLastSeenDate(date: string): Promise<void> {
    await invoke("config_set_value", {
      key: KEY_LAST_SEEN_DATE,
      value: date,
    });
  },

  async loadSessionBootstrap(): Promise<SessionBootstrap> {
    let lastExitClean = false;
    let lastSeenDate: string | null = null;

    try {
      lastExitClean = (await this.getLastExitClean()) ?? false;
      lastSeenDate = await this.getLastSeenDate();
    } catch (error) {
      console.error("[PetContext] loadSessionBootstrap read failed, defaulting to unclean:", error);
      lastExitClean = false;
      lastSeenDate = null;
    }

    const today = formatLocalDate(new Date());
    const isNewDay = lastSeenDate !== today;

    try {
      await this.setLastExitClean(false);
      await this.setLastSeenDate(today);
    } catch (error) {
      console.error(
        "[PetContext] dirty-bit write failed; this session may be undetectable next launch:",
        error,
      );
    }

    return { isNewDay, lastExitClean };
  },

  async markCleanExit(): Promise<void> {
    await this.setLastExitClean(true);
  },

  /**
   * Reserved migration hook: move petcontext.* from config table to dedicated pet_context table.
   */
  async migrateFromConfigTable(): Promise<void> {
    // Placeholder: migrate `petcontext.*` keys from config table to dedicated table.
  },
};

