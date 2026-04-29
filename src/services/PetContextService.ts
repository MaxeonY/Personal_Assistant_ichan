import { invoke } from "@tauri-apps/api/core";

/**
 * PetContext 持久化通道（过渡方案）。
 *
 * 当前使用 SQLite `config` 表（key-value 结构）存储 PetContext 字段。
 * 迁移触发条件（满足任一即启动迁移至独立 pet_context 表）：
 *   1. PetContext 字段数 >= 5 且跨领域使用（CSV/Notion/Chat）
 *   2. 单字段读写频率超过 1 次/分钟
 *   3. 需要事务性批量更新多个字段
 *
 * 详见任务卡 B1-12 §8.5。
 */

const KEY_LAST_CSV_IMPORT = "petcontext.lastCsvImportDate";

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

  /**
   * 预留：从 config 表迁移至独立 pet_context 表。
   * TODO(B1-12): 实现迁移逻辑，当触发任一迁移条件时调用。
   */
  async migrateFromConfigTable(): Promise<void> {
    // Placeholder: 将 config 表中 petcontext.* 键迁移至独立表
  },
};
