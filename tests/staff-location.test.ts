import { describe, expect, it } from "vitest";
import { evaluateStaffLocation, getStaffLocationDisplayState, getStaffLocationPostIntervalMs, getStaffLocationVisibilityCutoff, resolveStaffLocationPersistence, resolveStaffWorkWindow, shouldExposeOperationalLocation, shouldStoreStaffLocationHistory, STAFF_LOCATION_VISIBILITY_HOURS } from "../lib/staff-location";

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

describe("staff work window", () => {
  const now = Date.parse("2026-11-02T00:00:00.000Z");

  it("starts legacy active devices with a complete 12-hour window", () => {
    expect(resolveStaffWorkWindow(true, {}, now)).toEqual({
      work_started_at: "2026-11-02T00:00:00.000Z",
      work_ended_at: null,
      work_auto_ends_at: "2026-11-02T12:00:00.000Z"
    });
  });

  it("does not extend an existing work window on every location ping", () => {
    expect(resolveStaffWorkWindow(true, {
      startedAt: "2026-11-01T22:52:34.000Z",
      autoEndsAt: "2026-11-02T10:52:34.000Z"
    }, now)).toEqual({});
  });

  it("starts a new window after manual or automatic work end", () => {
    for (const existing of [
      { startedAt: "2026-11-01T00:00:00.000Z", endedAt: "2026-11-01T08:00:00.000Z", autoEndsAt: null },
      { startedAt: "2026-11-01T00:00:00.000Z", endedAt: null, autoEndsAt: "2026-11-01T12:00:00.000Z" }
    ]) {
      expect(resolveStaffWorkWindow(true, existing, now)).toMatchObject({
        work_started_at: "2026-11-02T00:00:00.000Z",
        work_ended_at: null,
        work_auto_ends_at: "2026-11-02T12:00:00.000Z"
      });
    }
  });

  it("ends work without creating an invalid automatic window", () => {
    expect(resolveStaffWorkWindow(false, {}, now)).toEqual({
      work_ended_at: "2026-11-02T00:00:00.000Z",
      work_auto_ends_at: null
    });
  });
});

describe("staff location quality", () => {
  const base = { lat: 37.5, lng: 127, recordedAt: "2026-10-26T00:00:00.000Z", accuracyMeters: 10 };
  it("rejects inaccurate and older positions", () => {
    expect(evaluateStaffLocation({ ...base, accuracyMeters: 101 })).toMatchObject({ accept: false, reason: "inaccurate" });
    expect(evaluateStaffLocation({ ...base, recordedAt: "2026-10-25T23:59:00.000Z" }, base)).toMatchObject({ accept: false, reason: "older" });
  });
  it("keeps stationary markers and rejects impossible jumps", () => {
    const stationary = evaluateStaffLocation({ ...base, lng: 127.00001, recordedAt: "2026-10-26T00:10:00.000Z" }, base);
    expect(stationary).toMatchObject({ accept: false, reason: "stationary" });
    expect(resolveStaffLocationPersistence(stationary, true, 600_000)).toEqual({
      storeHistory: false,
      updateCoordinates: false,
      updateTimestamp: true
    });
    expect(evaluateStaffLocation({ ...base, lat: 38.5, recordedAt: "2026-10-26T00:01:00.000Z" }, base)).toMatchObject({ accept: false, reason: "too_fast" });
  });
  it("persists moving coordinates for the next 10-second map poll", () => {
    const moving = evaluateStaffLocation({ ...base, lng: 127.0002, recordedAt: "2026-10-26T00:00:10.000Z" }, base);
    expect(moving.accept).toBe(true);
    expect(resolveStaffLocationPersistence(moving, true, 10_000)).toMatchObject({ updateCoordinates: true, updateTimestamp: true });
    expect(getStaffLocationPostIntervalMs(true)).toBe(10_000);
  });
  it("uses adaptive intervals and work sessions", () => {
    expect(getStaffLocationPostIntervalMs(true)).toBe(10_000);
    expect(getStaffLocationPostIntervalMs(false)).toBe(60_000);
    expect(shouldStoreStaffLocationHistory({ distanceMeters: 10, elapsedMs: 120_000 })).toBe(true);
    expect(shouldExposeOperationalLocation({ memberActive: true, userActive: true, workActive: true })).toBe(true);
  });
});
