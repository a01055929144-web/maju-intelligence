import { describe, expect, it } from "vitest";
import { evaluateStaffLocation, getStaffLocationDisplayState, getStaffLocationPostIntervalMs, getStaffLocationVisibilityCutoff, shouldExposeOperationalLocation, shouldStoreStaffLocationHistory, STAFF_LOCATION_VISIBILITY_HOURS } from "../lib/staff-location";

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

describe("staff location quality", () => {
  const base = { lat: 37.5, lng: 127, recordedAt: "2026-10-26T00:00:00.000Z", accuracyMeters: 10 };
  it("rejects inaccurate and older positions", () => {
    expect(evaluateStaffLocation({ ...base, accuracyMeters: 101 })).toMatchObject({ accept: false, reason: "inaccurate" });
    expect(evaluateStaffLocation({ ...base, recordedAt: "2026-10-25T23:59:00.000Z" }, base)).toMatchObject({ accept: false, reason: "older" });
  });
  it("keeps stationary markers and rejects impossible jumps", () => {
    expect(evaluateStaffLocation({ ...base, lng: 127.00001, recordedAt: "2026-10-26T00:01:00.000Z" }, base)).toMatchObject({ accept: false, reason: "stationary" });
    expect(evaluateStaffLocation({ ...base, lat: 38.5, recordedAt: "2026-10-26T00:01:00.000Z" }, base)).toMatchObject({ accept: false, reason: "too_fast" });
  });
  it("uses adaptive intervals and work sessions", () => {
    expect(getStaffLocationPostIntervalMs(true)).toBe(10_000);
    expect(getStaffLocationPostIntervalMs(false)).toBe(60_000);
    expect(shouldStoreStaffLocationHistory({ distanceMeters: 10, elapsedMs: 120_000 })).toBe(true);
    expect(shouldExposeOperationalLocation({ memberActive: true, userActive: true, workActive: true })).toBe(true);
  });
});
