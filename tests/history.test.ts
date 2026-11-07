import { describe, expect, it } from "vitest";
import {
  HISTORY_BUDGET_CHARS,
  HISTORY_LIMIT,
  HISTORY_MIN_ENTRIES,
  historyLimitForSnapshot,
  pushHistory,
} from "../src/state/history";

describe("adaptive history", () => {
  it("keeps the full entry limit for small projects", () => {
    expect(historyLimitForSnapshot("x".repeat(50_000))).toBe(HISTORY_LIMIT);
  });

  it("reduces the entry count for snapshots over the size budget", () => {
    const snapshot = "x".repeat(HISTORY_BUDGET_CHARS / 8);
    expect(historyLimitForSnapshot(snapshot)).toBe(8);
  });

  it("never drops below the minimum useful depth", () => {
    const snapshot = "x".repeat(HISTORY_BUDGET_CHARS * 4);
    expect(historyLimitForSnapshot(snapshot)).toBe(HISTORY_MIN_ENTRIES);
  });

  it("drops the oldest snapshots and keeps the newest", () => {
    const stack = ["1", "2", "3", "4"];
    const snapshot = "x".repeat(HISTORY_BUDGET_CHARS * 4);
    pushHistory(stack, snapshot);
    expect(stack).toEqual(["2", "3", "4", snapshot]);
  });
});
