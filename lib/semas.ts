// CC-46-5 소상공인시장진흥공단 상가(상권)정보 API(공공데이터포털 15012005) 호출.
// 이용허락범위 제한 없음(출처 표시). 키는 DATA_GO_KR_SERVICE_KEY(없으면 같은 포털 키 GOV_RESTAURANT_API_KEY) — 값은 로그·응답에 남기지 않는다.
import type { SemasStore } from "../domains/lead/semas-match";

const SEMAS_BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

export type SemasFetch = {
  readonly status: "ok" | "not_configured" | "error";
  readonly httpStatus: number;
  readonly resultCode?: string;
  readonly stores: SemasStore[];
};

export function getSemasServiceKey(env: Record<string, string | undefined> = process.env) {
  const key = (env.DATA_GO_KR_SERVICE_KEY || env.GOV_RESTAURANT_API_KEY || "").trim();
  return key && !key.startsWith("replace-with") ? key : "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function num(value: unknown) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
}

/** 응답 본문 → 상가 목록. 형식이 다르거나 resultCode가 정상("00")이 아니면 빈 목록 + 코드. */
export function parseSemasResponse(payload: unknown): { resultCode: string; stores: SemasStore[] } {
  const root = (payload && typeof payload === "object" ? payload : {}) as { header?: { resultCode?: unknown }; body?: { items?: unknown } };
  const resultCode = text(root.header?.resultCode);
  const rawItems = root.body?.items;
  const items = Array.isArray(rawItems) ? rawItems : rawItems && typeof rawItems === "object" && Array.isArray((rawItems as { item?: unknown }).item) ? (rawItems as { item: unknown[] }).item : [];
  if (resultCode && resultCode !== "00") return { resultCode, stores: [] };
  const stores = items
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : {}))
    .map((row): SemasStore => ({
      id: text(row.bizesId),
      name: text(row.bizesNm),
      branch: text(row.brchNm) || undefined,
      industryLarge: text(row.indsLclsNm) || undefined,
      industryMiddle: text(row.indsMclsNm) || undefined,
      industrySmall: text(row.indsSclsNm) || undefined,
      industrySmallCode: text(row.indsSclsCd) || undefined,
      roadAddress: text(row.rdnmAdr) || undefined,
      jibunAddress: text(row.lnoAdr) || undefined,
      lat: num(row.lat),
      lng: num(row.lon)
    }))
    .filter((store) => store.id && store.name);
  return { resultCode: resultCode || "00", stores };
}

/** 리드 좌표 반경(기본 100m) 안의 영업 중 상가. */
export async function fetchSemasStoresInRadius(lat: number, lng: number, radiusM = 100): Promise<SemasFetch> {
  const key = getSemasServiceKey();
  if (!key) return { status: "not_configured", httpStatus: 0, stores: [] };
  const url = new URL(`${SEMAS_BASE}/storeListInRadius`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("radius", String(Math.max(10, Math.min(500, Math.round(radiusM)))));
  url.searchParams.set("cx", String(lng));
  url.searchParams.set("cy", String(lat));
  url.searchParams.set("type", "json");
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: "error", httpStatus: response.status, stores: [] };
    const parsed = parseSemasResponse(await response.json().catch(() => null));
    // 03 = 데이터 없음(반경 안 상가 0곳)은 정상으로 본다.
    if (parsed.resultCode !== "00" && parsed.resultCode !== "03") return { status: "error", httpStatus: response.status, resultCode: parsed.resultCode, stores: [] };
    return { status: "ok", httpStatus: response.status, resultCode: parsed.resultCode, stores: parsed.stores };
  } catch {
    return { status: "error", httpStatus: 0, stores: [] };
  }
}
