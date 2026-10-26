export const STAFF_LOCATION_FRESHNESS_MINUTES = 5;
export const STAFF_LOCATION_VISIBILITY_HOURS = 24;
export const STAFF_LOCATION_MAX_ACCURACY_METERS = 100;
export const STAFF_LOCATION_MAX_SPEED_KPH = 150;

export type StaffLocationDisplayState = "realtime" | "delayed" | "last_operation";
export type StaffLocationPoint = { accuracyMeters?: number; lat: number; lng: number; recordedAt: string };
export type StaffLocationDecision = { accept: boolean; distanceMeters: number; reason?: "inaccurate" | "stationary" | "too_fast" | "older"; speedKph?: number };

export function evaluateStaffLocation(next: StaffLocationPoint, previous?: StaffLocationPoint): StaffLocationDecision {
  const accuracy = Number(next.accuracyMeters || 0);
  if (accuracy > STAFF_LOCATION_MAX_ACCURACY_METERS) return { accept: false, distanceMeters: 0, reason: "inaccurate" };
  if (!previous) return { accept: true, distanceMeters: 0 };
  const nextAt = new Date(next.recordedAt).getTime();
  const previousAt = new Date(previous.recordedAt).getTime();
  if (!Number.isFinite(nextAt) || nextAt <= previousAt) return { accept: false, distanceMeters: 0, reason: "older" };
  const distanceMeters = haversineMeters(previous, next);
  if (distanceMeters < Math.max(15, accuracy / 2)) return { accept: false, distanceMeters, reason: "stationary" };
  const speedKph = distanceMeters / 1000 / ((nextAt - previousAt) / 3_600_000);
  if (speedKph > STAFF_LOCATION_MAX_SPEED_KPH) return { accept: false, distanceMeters, reason: "too_fast", speedKph };
  return { accept: true, distanceMeters, speedKph };
}

export const shouldStoreStaffLocationHistory = (input: { distanceMeters: number; elapsedMs: number }) => input.distanceMeters >= 25 || input.elapsedMs >= 120_000;

export function resolveStaffLocationPersistence(decision: StaffLocationDecision, hasPrevious: boolean, elapsedMs: number) {
  const updateCoordinates = decision.accept && decision.reason !== "older";
  const updateTimestamp = updateCoordinates || decision.reason === "stationary";
  const storeHistory = updateCoordinates
    && (!hasPrevious || shouldStoreStaffLocationHistory({ distanceMeters: decision.distanceMeters, elapsedMs }));
  return { storeHistory, updateCoordinates, updateTimestamp };
}
export const getStaffLocationPostIntervalMs = (isMoving: boolean) => isMoving ? 10_000 : 60_000;
export const getStaffMapPollIntervalMs = (hasRealtimeVehicle: boolean) => hasRealtimeVehicle ? 10_000 : 30_000;

export function getStaffLocationDisplayState(lastLocationAt: string | undefined, nowMs = Date.now()): StaffLocationDisplayState {
  const recordedAt = lastLocationAt ? new Date(lastLocationAt).getTime() : Number.NaN;
  if (!Number.isFinite(recordedAt)) return "last_operation";
  const ageMinutes = Math.max(0, (nowMs - recordedAt) / 60_000);
  if (ageMinutes <= STAFF_LOCATION_FRESHNESS_MINUTES) return "realtime";
  if (ageMinutes <= STAFF_LOCATION_VISIBILITY_HOURS * 60) return "delayed";
  return "last_operation";
}

export function shouldExposeOperationalLocation(input: { currentCustomerId?: string | null; memberActive: boolean; userActive: boolean; workActive?: boolean }) {
  return input.memberActive && input.userActive && (input.workActive === true || Boolean(input.currentCustomerId));
}

export const getStaffLocationVisibilityCutoff = (nowMs = Date.now()) => new Date(nowMs - STAFF_LOCATION_VISIBILITY_HOURS * 3_600_000).toISOString();

function haversineMeters(a: Pick<StaffLocationPoint, "lat" | "lng">, b: Pick<StaffLocationPoint, "lat" | "lng">) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
