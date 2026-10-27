import { describe, expect, it } from "vitest";
import { formatTimestamp, timestampValue } from "../src/model/dates";

describe("timestamps", () => {
  it("formats an ISO timestamp as YYYY-MM-DD HH:mm locally", () => {
    const formatted = formatTimestamp("2026-03-09T14:05:00.000Z");
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const date = new Date("2026-03-09T14:05:00.000Z");
    expect(formatted.startsWith(`${date.getFullYear()}-`)).toBe(true);
  });

  it("handles missing and invalid timestamps", () => {
    expect(formatTimestamp(undefined)).toBe("–");
    expect(formatTimestamp("")).toBe("–");
    expect(formatTimestamp("not-a-date")).toBe("–");
  });

  it("sorts by epoch and treats missing values as oldest", () => {
    expect(timestampValue("2026-03-09T14:05:00.000Z")).toBe(Date.parse("2026-03-09T14:05:00.000Z"));
    expect(timestampValue(undefined)).toBe(0);
    expect(timestampValue("nope")).toBe(0);
  });
});
