import { describe, expect, it } from "vitest";
import { getTmsServiceDateKey, TMS_SERVICE_TIME_ZONE } from "../domains/delivery/service-date";

describe("TMS service date", () => {
  it("uses Asia/Seoul as the single business time zone", () => {
    expect(TMS_SERVICE_TIME_ZONE).toBe("Asia/Seoul");
  });

  it("moves to the next service date at KST midnight regardless of browser time zone", () => {
    expect(getTmsServiceDateKey("2026-11-01T14:59:59.999Z")).toBe("2026-11-01");
    expect(getTmsServiceDateKey("2026-11-01T15:00:00.000Z")).toBe("2026-11-02");
  });

  it("keeps the KST date when UTC is still on the previous calendar day", () => {
    expect(getTmsServiceDateKey("2026-10-31T16:30:00.000Z")).toBe("2026-11-01");
  });

  it("rejects invalid instants instead of silently polling an incorrect route day", () => {
    expect(() => getTmsServiceDateKey("not-a-date")).toThrow(RangeError);
  });
});
