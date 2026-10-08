export const STAFF_LOCATION_FRESHNESS_MINUTES = 5;

// The latest-device table is a live operational snapshot, not the GPS archive.
// Keep old events in staff_location_events, while preventing a phone that has not
// reported for days from being counted forever as another live vehicle.
export const STAFF_LOCATION_VISIBILITY_HOURS = 24;

export function getStaffLocationVisibilityCutoff(nowMs = Date.now()) {
  return new Date(nowMs - STAFF_LOCATION_VISIBILITY_HOURS * 60 * 60 * 1000).toISOString();
}
