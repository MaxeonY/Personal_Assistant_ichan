export interface HungryDecisionInput {
  lastCsvImportDate: string;
  nowDate: string;
  thresholdDays: number;
}

export interface HungryDecisionOutput {
  isHungry: boolean;
  daysSinceFeed: number;
}

/**
 * 判定宠物是否处于 hungry 状态。
 *
 * 边界处理：
 * - 空字符串 -> 从未投喂：`isHungry: true, daysSinceFeed: POSITIVE_INFINITY`
 * - 非法日期格式（如 'invalid'、'2026-13-45'）-> 视为从未投喂
 * - 未来日期（`daysSinceFeed < 0`）-> 视为同日投喂：`isHungry: false, daysSinceFeed: 0`
 * - 阈值边界：`daysSinceFeed >= thresholdDays` 时判定为 hungry
 */
export function decideHungry(input: HungryDecisionInput): HungryDecisionOutput {
  const { lastCsvImportDate, nowDate, thresholdDays } = input;

  if (!lastCsvImportDate || lastCsvImportDate.trim() === "") {
    return { isHungry: true, daysSinceFeed: Number.POSITIVE_INFINITY };
  }

  const lastDate = parseLocalDate(lastCsvImportDate);
  const now = parseLocalDate(nowDate);

  if (lastDate === null || now === null) {
    return { isHungry: true, daysSinceFeed: Number.POSITIVE_INFINITY };
  }

  const diffMs = now.getTime() - lastDate.getTime();
  const daysSinceFeed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysSinceFeed < 0) {
    return { isHungry: false, daysSinceFeed: 0 };
  }

  return {
    isHungry: daysSinceFeed >= thresholdDays,
    daysSinceFeed,
  };
}

/** 解析 YYYY-MM-DD 字符串为本地日期对象；非法格式返回 null */
function parseLocalDate(dateStr: string): Date | null {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (!match) {
    return null;
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }

  return date;
}
