import { describe, expect, it } from "vitest";
import { getStaffLocationDisplayState, getStaffLocationVisibilityCutoff, shouldExposeOperationalLocation, STAFF_LOCATION_VISIBILITY_HOURS } from "../lib/staff-location";

describe("staff live-location visibility", () => {
  it("keeps the live snapshot window separate from long-term GPS history", () => {
    const now = Date.parse("2026-10-08T00:00:00.000Z");

    expect(STAFF_LOCATION_VISIBILITY_HOURS).toBe(24);
    expect(getStaffLocationVisibilityCutoff(now)).toBe("2026-10-07T00:00:00.000Z");
  });

  it("keeps a 34-hour-old work location as the last operation", () => {
    const now = Date.parse("2026-10-25T03:00:00.000Z");
    expect(getStaffLocationDisplayState("2026-10-23T17:00:00.000Z", now)).toBe("last_operation");
  });

  it("does not expose an off-work location", () => {
    expect(shouldExposeOperationalLocation({ currentCustomerId: null, memberActive: true, userActive: true })).toBe(false);
  });

  it("does not expose an inactive driver's location", () => {
    expect(shouldExposeOperationalLocation({ currentCustomerId: "customer-1", memberActive: false, userActive: true })).toBe(false);
  });
});
