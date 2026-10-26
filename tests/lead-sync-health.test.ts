import { describe, expect, it } from "vitest";
import { isConsecutiveDailyZeroFetch } from "../domains/lead/sync-health";

describe("isConsecutiveDailyZeroFetch", () => {
  it("marks two consecutive KST cron days with zero fetched rows", () => {
    expect(isConsecutiveDailyZeroFetch({
      currentStartedAt: "2026-10-26T21:00:00.000Z",
      currentFetched: 0,
      previousStartedAt: "2026-10-25T21:00:00.000Z",
      previousFetched: 0,
      previousStatus: "success"
    })).toBe(true);
  });

  it("does not mark a gap, a non-zero fetch, or a previous error", () => {
    expect(isConsecutiveDailyZeroFetch({
      currentStartedAt: "2026-10-26T21:00:00.000Z",
      currentFetched: 0,
      previousStartedAt: "2026-10-24T21:00:00.000Z",
      previousFetched: 0,
      previousStatus: "success"
    })).toBe(false);
    expect(isConsecutiveDailyZeroFetch({
      currentStartedAt: "2026-10-26T21:00:00.000Z",
      currentFetched: 1,
      previousStartedAt: "2026-10-25T21:00:00.000Z",
      previousFetched: 0,
      previousStatus: "success"
    })).toBe(false);
  });
});
