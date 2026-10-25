export const STAFF_LOCATION_FRESHNESS_MINUTES = 5;

// The latest-device table is a live operational snapshot, not the GPS archive.
// Keep old events in staff_location_events, while preventing a phone that has not
// reported for days from being counted forever as another live vehicle.
export const STAFF_LOCATION_VISIBILITY_HOURS = 24;

export type StaffLocationDisplayState = "realtime" | "delayed" | "last_operation";

export function getStaffLocationDisplayState(lastLocationAt: string | undefined, nowMs = Date.now()): StaffLocationDisplayState {
  const recordedAt = lastLocationAt ? new Date(lastLocationAt).getTime() : Number.NaN;
  if (!Number.isFinite(recordedAt)) return "last_operation";
  const ageMinutes = Math.max(0, (nowMs - recordedAt) / 60_000);
  if (ageMinutes <= STAFF_LOCATION_FRESHNESS_MINUTES) return "realtime";
  if (ageMinutes <= STAFF_LOCATION_VISIBILITY_HOURS * 60) return "delayed";
  return "last_operation";
}

export function shouldExposeOperationalLocation(input: { currentCustomerId?: string | null; memberActive: boolean; userActive: boolean }) {
  return input.memberActive && input.userActive && Boolean(input.currentCustomerId);
}

export function getStaffLocationVisibilityCutoff(nowMs = Date.now()) {
  return new Date(nowMs - STAFF_LOCATION_VISIBILITY_HOURS * 60 * 60 * 1000).toISOString();
}
