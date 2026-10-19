import { describe, expect, it } from "vitest";
import { getLeadVisitAvailability, parseLeadBusinessHoursQuickInput } from "../domains/lead/business-hours";

describe("lead business hours", () => {
  it("parses daily breaks and weekly closures", () => {
    expect(parseLeadBusinessHoursQuickInput("매일 15:00~17:00 브레이크")).toHaveLength(7);
    expect(parseLeadBusinessHoursQuickInput("월 휴무")).toEqual([{ weekday: 1, intervalIndex: 0, isClosed: true, opensAt: undefined, closesAt: undefined }]);
  });
  it("uses KST for visit availability", () => {
    const intervals = parseLeadBusinessHoursQuickInput("매일 15:00~17:00 브레이크");
    expect(getLeadVisitAvailability(intervals, new Date("2026-10-19T06:30:00Z")).isVisitAvailableNow).toBe(false);
  });
});
