// CC-46-5 S1: 소상공인 상가정보로 "채울 수 있는 수"만 세는 dry-run(읽기만, DB 쓰기 없음).
// 응답에는 숫자만 — 상호·주소 원문은 넣지 않는다. 대상: 좌표 있음 + 업종 비었거나 '기타' + 폐업 아님(S1a).
import { isClosedLead } from "./leads";
import { matchLeadToSemas, semasRegion, type SemasMatch, type SemasRegion } from "../domains/lead/semas-match";
import type { SemasFetch } from "./semas";

export type SemasDryRunLead = {
  readonly id: string;
  readonly business_name: string | null;
  readonly address: string | null;
  readonly latitude: number | string | null;
  readonly longitude: number | string | null;
  readonly industry_primary: string | null;
  readonly status: string | null;
  readonly permit_status: string | null;
};

export type SemasDryRunReport = {
  readonly sampled: number;
  readonly excludedClosed: number;
  readonly resultCodes: Record<"filled" | "already_complete" | "not_found" | "rejected" | "error", number>;
  readonly rejectReasons: Record<string, number>;
  readonly fills: { readonly industry: number; readonly industryLarge: number; readonly industryMiddle: number; readonly industrySmall: number; readonly coords: number };
  readonly api: { readonly calls: number; readonly ok: number; readonly lastHttpStatus: number; readonly lastResultCode: string; readonly notConfigured: boolean };
};

function toNumber(value: number | string | null) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

export async function runSemasDryRun(
  leads: readonly SemasDryRunLead[],
  limit: number,
  fetchStores: (lat: number, lng: number) => Promise<SemasFetch>
): Promise<SemasDryRunReport> {
  const open = leads.filter((lead) => !isClosedLead({ status: lead.status, permitStatus: lead.permit_status }));
  const excludedClosed = leads.length - open.length;
  const targets = open
    .map((lead) => ({ lead, lat: toNumber(lead.latitude), lng: toNumber(lead.longitude) }))
    .filter((item): item is { lead: SemasDryRunLead; lat: number; lng: number } => item.lat !== null && item.lng !== null)
    .slice(0, Math.max(0, limit));

  const resultCodes = { filled: 0, already_complete: 0, not_found: 0, rejected: 0, error: 0 };
  const rejectReasons: Record<string, number> = {};
  const fills = { industry: 0, industryLarge: 0, industryMiddle: 0, industrySmall: 0, coords: 0 };
  let calls = 0;
  let ok = 0;
  let lastHttpStatus = 0;
  let lastResultCode = "";
  let notConfigured = false;

  // 공공데이터 호출 한도를 아끼려고 한 번에 3건씩만.
  for (let index = 0; index < targets.length; index += 3) {
    const batch = targets.slice(index, index + 3);
    const results = await Promise.all(batch.map(async ({ lead, lat, lng }) => {
      const fetched = await fetchStores(lat, lng);
      return { lead, lat, lng, fetched };
    }));
    for (const { lead, lat, lng, fetched } of results) {
      calls += 1;
      lastHttpStatus = fetched.httpStatus;
      lastResultCode = fetched.resultCode || lastResultCode;
      if (fetched.status === "not_configured") notConfigured = true;
      if (fetched.status !== "ok") { resultCodes.error += 1; continue; }
      ok += 1;
      const match: SemasMatch = matchLeadToSemas({ name: lead.business_name || "", address: lead.address, lat, lng, industryPrimary: lead.industry_primary }, fetched.stores);
      resultCodes[match.resultCode] += 1;
      if (match.rejectReason) rejectReasons[match.rejectReason] = (rejectReasons[match.rejectReason] || 0) + 1;
      if (match.fills.industry) {
        fills.industry += 1;
        if (match.store?.industryLarge) fills.industryLarge += 1;
        if (match.store?.industryMiddle) fills.industryMiddle += 1;
        if (match.store?.industrySmall) fills.industrySmall += 1;
      }
      if (match.fills.coords) fills.coords += 1;
    }
    if (notConfigured) break; // 키가 없으면 더 부르지 않는다.
  }

  return { sampled: targets.length, excludedClosed, resultCodes, rejectReasons, fills, api: { calls, ok, lastHttpStatus, lastResultCode, notConfigured } };
}

/** S1b: 좌표 없는 리드를 행정동별 한 번씩 조회해 숫자만 집계한다. */
export async function runSemasDongDryRun(
  leads: readonly SemasDryRunLead[],
  limit: number,
  fetchStores: (region: SemasRegion) => Promise<SemasFetch>
): Promise<SemasDryRunReport> {
  const open = leads.filter((lead) => !isClosedLead({ status: lead.status, permitStatus: lead.permit_status }));
  const excludedClosed = leads.length - open.length;
  const targets = open.filter((lead) => toNumber(lead.latitude) === null || toNumber(lead.longitude) === null).slice(0, Math.max(0, limit));
  const resultCodes = { filled: 0, already_complete: 0, not_found: 0, rejected: 0, error: 0 };
  const rejectReasons: Record<string, number> = {};
  const fills = { industry: 0, industryLarge: 0, industryMiddle: 0, industrySmall: 0, coords: 0 };
  const cache = new Map<string, Promise<SemasFetch>>();
  const counted = new Set<string>();
  let calls = 0, ok = 0, lastHttpStatus = 0, lastResultCode = "", notConfigured = false;

  for (const lead of targets) {
    const region = semasRegion(lead.address);
    if (!region) { resultCodes.rejected += 1; rejectReasons.address_mismatch = (rejectReasons.address_mismatch || 0) + 1; continue; }
    const cacheKey = `${region.province}|${region.district}|${region.dong}`;
    let pending = cache.get(cacheKey);
    if (!pending) { pending = fetchStores(region); cache.set(cacheKey, pending); }
    const fetched = await pending;
    if (!counted.has(cacheKey)) {
      counted.add(cacheKey);
      calls += fetched.calls ?? 1;
      if (fetched.status === "ok") ok += 1;
    }
    lastHttpStatus = fetched.httpStatus;
    lastResultCode = fetched.resultCode || lastResultCode;
    if (fetched.status === "not_configured") notConfigured = true;
    if (fetched.status !== "ok") { resultCodes.error += 1; if (notConfigured) break; continue; }
    const match: SemasMatch = matchLeadToSemas({ name: lead.business_name || "", address: lead.address, lat: null, lng: null, industryPrimary: lead.industry_primary }, fetched.stores);
    resultCodes[match.resultCode] += 1;
    if (match.rejectReason) rejectReasons[match.rejectReason] = (rejectReasons[match.rejectReason] || 0) + 1;
    if (match.fills.industry) {
      fills.industry += 1;
      if (match.store?.industryLarge) fills.industryLarge += 1;
      if (match.store?.industryMiddle) fills.industryMiddle += 1;
      if (match.store?.industrySmall) fills.industrySmall += 1;
    }
    if (match.fills.coords) fills.coords += 1;
  }
  return { sampled: targets.length, excludedClosed, resultCodes, rejectReasons, fills, api: { calls, ok, lastHttpStatus, lastResultCode, notConfigured } };
}
