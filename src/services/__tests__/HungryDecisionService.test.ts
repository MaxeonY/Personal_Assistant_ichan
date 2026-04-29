import { describe, it, expect } from "vitest";
import { decideHungry } from "../HungryDecisionService";

const today = "2026-04-28";
const threshold = 3;

function input(lastCsvImportDate: string) {
  return { lastCsvImportDate, nowDate: today, thresholdDays: threshold };
}

describe("decideHungry", () => {
  it("returns hungry when lastCsvImportDate is empty", () => {
    const result = decideHungry(input(""));
    expect(result.isHungry).toBe(true);
    expect(result.daysSinceFeed).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns not hungry when fed today", () => {
    const result = decideHungry(input("2026-04-28"));
    expect(result.isHungry).toBe(false);
    expect(result.daysSinceFeed).toBe(0);
  });

  it("returns not hungry at threshold -1 (2 days)", () => {
    const result = decideHungry(input("2026-04-26"));
    expect(result.isHungry).toBe(false);
    expect(result.daysSinceFeed).toBe(2);
  });

  it("returns hungry at exact threshold (3 days)", () => {
    const result = decideHungry(input("2026-04-25"));
    expect(result.isHungry).toBe(true);
    expect(result.daysSinceFeed).toBe(3);
  });

  it("returns hungry at threshold +1 (4 days)", () => {
    const result = decideHungry(input("2026-04-24"));
    expect(result.isHungry).toBe(true);
    expect(result.daysSinceFeed).toBe(4);
  });

  it("returns not hungry for future date (system clock error)", () => {
    const result = decideHungry(input("2026-05-10"));
    expect(result.isHungry).toBe(false);
    expect(result.daysSinceFeed).toBe(0);
  });

  it("returns hungry for invalid date formats", () => {
    const r1 = decideHungry(input("invalid"));
    expect(r1.isHungry).toBe(true);
    expect(r1.daysSinceFeed).toBe(Number.POSITIVE_INFINITY);

    const r2 = decideHungry(input("2026-13-45"));
    expect(r2.isHungry).toBe(true);
    expect(r2.daysSinceFeed).toBe(Number.POSITIVE_INFINITY);
  });
});
