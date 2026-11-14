// CC-46-5 소상공인 상가(상권)정보 ↔ 리드 매칭 규칙(지시서 docs/dispatch/2026-11-14-semas-store-info.md 2절).
// 비어 있거나 '기타'인 업종, 없는 좌표만 채운다(인허가 값 덮어쓰기 금지). 폐업 리드는 호출하는 쪽에서 뺀다(isClosedLead).
// 상호 비교는 카카오 보강과 같은 정규화·점수(kakaoNameVariants·placeNameScore)를 쓴다.
import { kakaoNameVariants, placeNameScore } from "../../lib/place-links";

export type SemasStore = {
  readonly id: string;
  readonly name: string;
  readonly branch?: string;
  readonly industryLarge?: string;
  readonly industryMiddle?: string;
  readonly industrySmall?: string;
  readonly industrySmallCode?: string;
  readonly roadAddress?: string;
  readonly jibunAddress?: string;
  readonly lat?: number;
  readonly lng?: number;
};

export type SemasLead = {
  readonly name: string;
  readonly address?: string | null;
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly industryPrimary?: string | null;
};

export type SemasRejectReason = "name_low" | "ambiguous" | "too_far" | "address_mismatch";
export type SemasMatch = {
  readonly resultCode: "filled" | "already_complete" | "not_found" | "rejected";
  readonly rejectReason?: SemasRejectReason;
  readonly store?: SemasStore;
  readonly score?: number;
  readonly distanceM?: number | null;
  readonly fills: { readonly industry: boolean; readonly coords: boolean };
};

export const SEMAS_NAME_MIN_SCORE = 0.6;
export const SEMAS_AMBIGUOUS_GAP = 0.1;
export const SEMAS_MAX_DISTANCE_M = 50;

export function needsSemasIndustry(industryPrimary?: string | null) {
  const value = (industryPrimary || "").trim();
  return !value || value === "기타";
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/** 도로명 + 본번(예: "세종대로 110"). 좌표가 없을 때 주소 일치 판단에 쓴다. */
export function roadKey(address?: string | null) {
  const match = (address || "").replace(/\([^)]*\)/g, " ").match(/([가-힣0-9]+(?:로|길))\s*(\d+)/);
  return match ? `${match[1]} ${match[2]}` : "";
}

function nameScore(leadName: string, store: SemasStore) {
  const leadNames = [leadName, ...kakaoNameVariants(leadName).map((item) => item.name)];
  const storeNames = [store.name, store.branch ? `${store.name} ${store.branch}` : ""].filter(Boolean);
  let best = 0;
  for (const a of leadNames) for (const b of storeNames) best = Math.max(best, placeNameScore(a, b));
  return best;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function matchLeadToSemas(lead: SemasLead, stores: readonly SemasStore[]): SemasMatch {
  const needIndustry = needsSemasIndustry(lead.industryPrimary);
  const needCoords = !finite(lead.lat) || !finite(lead.lng);
  if (!needIndustry && !needCoords) return { resultCode: "already_complete", fills: { industry: false, coords: false } };
  if (!stores.length) return { resultCode: "not_found", fills: { industry: false, coords: false } };

  const leadPoint = needCoords ? null : { lat: lead.lat as number, lng: lead.lng as number };
  const leadRoad = roadKey(lead.address);
  const scored = stores
    .map((store) => {
      const distance = leadPoint && finite(store.lat) && finite(store.lng) ? distanceMeters(leadPoint, { lat: store.lat, lng: store.lng }) : null;
      const sameRoad = Boolean(leadRoad) && leadRoad === roadKey(store.roadAddress);
      return { store, score: nameScore(lead.name, store), distance, sameRoad };
    })
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  const none = { industry: false, coords: false };
  if (best.score < SEMAS_NAME_MIN_SCORE) return { resultCode: "rejected", rejectReason: "name_low", score: best.score, distanceM: best.distance, fills: none };
  if (second && second.score >= SEMAS_NAME_MIN_SCORE && best.score - second.score < SEMAS_AMBIGUOUS_GAP && second.store.id !== best.store.id) {
    return { resultCode: "rejected", rejectReason: "ambiguous", score: best.score, distanceM: best.distance, fills: none };
  }
  if (best.distance !== null && best.distance > SEMAS_MAX_DISTANCE_M) return { resultCode: "rejected", rejectReason: "too_far", score: best.score, distanceM: best.distance, fills: none };
  if (best.distance === null && !best.sameRoad) return { resultCode: "rejected", rejectReason: "address_mismatch", score: best.score, distanceM: null, fills: none };

  const fills = {
    industry: needIndustry && Boolean(best.store.industrySmall?.trim()),
    coords: needCoords && finite(best.store.lat) && finite(best.store.lng)
  };
  return fills.industry || fills.coords
    ? { resultCode: "filled", store: best.store, score: best.score, distanceM: best.distance, fills }
    : { resultCode: "already_complete", store: best.store, score: best.score, distanceM: best.distance, fills };
}
