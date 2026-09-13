export type RevenueGrade = "A" | "B" | "C";

type RouteTotalRow = {
  distanceKm?: number;
  durationMinutes?: number;
  expectedRevenue?: number;
};

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Attachments can be large because previews are stored as data URLs in the browser.
  }
}

export function getStoreTotals(stores: RouteTotalRow[]) {
  return {
    distanceKm: roundToOneDecimal(stores.reduce((total, store) => total + Number(store.distanceKm || 0), 0)),
    durationMinutes: stores.reduce((total, store) => total + Number(store.durationMinutes || 0), 0),
    expectedRevenue: stores.reduce((total, store) => total + Number(store.expectedRevenue || 0), 0)
  };
}

export function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

export function formatDistanceKmLabel(distanceKm: number | undefined) {
  if (!distanceKm) return "거리 확인 필요";
  return `${distanceKm.toLocaleString()}km`;
}

export function estimateFuelCostWon(distanceKm: number, pricePerLiter: number, mileageKmPerLiter = 7.5) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) return 0;
  if (!Number.isFinite(mileageKmPerLiter) || mileageKmPerLiter <= 0) return 0;
  return Math.round((distanceKm / mileageKmPerLiter) * pricePerLiter);
}

export function deliveryCostRatio(roundTripFuelCostWon: number, monthlyRevenueManwon: number) {
  const monthlyRevenueWon = monthlyRevenueManwon * 10000;
  if (!Number.isFinite(monthlyRevenueWon) || monthlyRevenueWon <= 0) return null;
  if (!Number.isFinite(roundTripFuelCostWon) || roundTripFuelCostWon <= 0) return 0;
  return roundTripFuelCostWon / monthlyRevenueWon;
}

export function deliveryWorthLabel(ratio: number | null): { label: string; toneClassName: string } {
  if (ratio === null) return { label: "매출 확인 필요", toneClassName: "bg-slate-100 text-slate-600" };
  if (ratio <= 0.05) return { label: "배송 효율적", toneClassName: "bg-emerald-100 text-emerald-800" };
  if (ratio <= 0.15) return { label: "적정 범위", toneClassName: "bg-amber-100 text-amber-800" };
  return { label: "재검토 필요", toneClassName: "bg-rose-100 text-rose-800" };
}

export function roundToSix(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

export function gradeBadgeClass(grade: RevenueGrade) {
  if (grade === "A") return "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800 ring-1 ring-inset ring-emerald-200";
  if (grade === "B") return "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-800 ring-1 ring-inset ring-blue-200";
  return "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200";
}

export function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
