// CC-46-5 소상공인시장진흥공단 상가(상권)정보 API(공공데이터포털 15012005) 호출.
// 이용허락범위 제한 없음(출처 표시). 키는 DATA_GO_KR_SERVICE_KEY(없으면 같은 포털 키 GOV_RESTAURANT_API_KEY) — 값은 로그·응답에 남기지 않는다.
import type { SemasRegion, SemasStore } from "../domains/lead/semas-match";

const SEMAS_BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

export type SemasFetch = {
  readonly status: "ok" | "not_configured" | "error";
  readonly httpStatus: number;
  readonly resultCode?: string;
  readonly stores: SemasStore[];
  readonly calls?: number;
};

export function getSemasServiceKey(env: Record<string, string | undefined> = process.env) {
  const key = (env.DATA_GO_KR_SERVICE_KEY || env.GOV_RESTAURANT_API_KEY || "").trim();
  return key && !key.startsWith("replace-with") ? key : "";
}

function responseItems(payload: unknown) {
  const root = (payload && typeof payload === "object" ? payload : {}) as { body?: { items?: unknown } };
  const raw = root.body?.items;
  const values = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { item?: unknown }).item) ? (raw as { item: unknown[] }).item : [];
  return values.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {});
}

function responseTotal(payload: unknown) {
  const root = (payload && typeof payload === "object" ? payload : {}) as { body?: { totalCount?: unknown } };
  const value = Number(root.body?.totalCount);
  return Number.isFinite(value) && value > 0 ? value : 0;
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

async function fetchJson(path: string, params: Record<string, string>) {
  const key = getSemasServiceKey();
  if (!key) return { status: "not_configured" as const, httpStatus: 0, payload: null, calls: 0 };
  const url = new URL(`${SEMAS_BASE}/${path}`);
  url.searchParams.set("serviceKey", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return { status: response.ok ? "ok" as const : "error" as const, httpStatus: response.status, payload: response.ok ? await response.json().catch(() => null) : null, calls: 1 };
  } catch {
    return { status: "error" as const, httpStatus: 0, payload: null, calls: 1 };
  }
}

function sameDongName(a: string, b: string) {
  if (a === b) return true;
  return a.replace(/\d+(?=동$)/, "") === b.replace(/\d+(?=동$)/, "");
}

/** 공식 행정경계 API로 코드를 찾고 storeListInDong을 조회한다. DB 변경·쓰기는 없다. */
export async function fetchSemasStoresInDong(region: SemasRegion): Promise<SemasFetch> {
  let calls = 0;
  const boundary = async (catId: "mega" | "cty" | "admi", extra: Record<string, string> = {}) => {
    const result = await fetchJson("baroApi", { resId: "dong", catId, type: "json", ...extra });
    calls += result.calls;
    return result;
  };
  const provinces = await boundary("mega");
  if (provinces.status !== "ok") return { status: provinces.status, httpStatus: provinces.httpStatus, stores: [], calls };
  const province = responseItems(provinces.payload).find((row) => text(row.ctprvnNm) === region.province);
  if (!province) return { status: "ok", httpStatus: provinces.httpStatus, resultCode: "03", stores: [], calls };

  const districts = await boundary("cty", { ctprvnCd: text(province.ctprvnCd) });
  if (districts.status !== "ok") return { status: districts.status, httpStatus: districts.httpStatus, stores: [], calls };
  const district = responseItems(districts.payload).find((row) => text(row.signguNm) === region.district);
  if (!district) return { status: "ok", httpStatus: districts.httpStatus, resultCode: "03", stores: [], calls };

  const dongs = await boundary("admi", { signguCd: text(district.signguCd) });
  if (dongs.status !== "ok") return { status: dongs.status, httpStatus: dongs.httpStatus, stores: [], calls };
  const candidates = responseItems(dongs.payload).filter((row) => sameDongName(text(row.adongNm), region.dong));
  if (!candidates.length) return { status: "ok", httpStatus: dongs.httpStatus, resultCode: "03", stores: [], calls };

  const stores = new Map<string, SemasStore>();
  let httpStatus = 0;
  let resultCode = "00";
  for (const candidate of candidates) {
    let page = 1;
    do {
      const fetched = await fetchJson("storeListInDong", { pageNo: String(page), numOfRows: "1000", divId: "adongCd", key: text(candidate.adongCd), type: "json" });
      calls += fetched.calls;
      httpStatus = fetched.httpStatus;
      if (fetched.status !== "ok") return { status: fetched.status, httpStatus, stores: [], calls };
      const parsed = parseSemasResponse(fetched.payload);
      resultCode = parsed.resultCode;
      if (resultCode !== "00" && resultCode !== "03") return { status: "error", httpStatus, resultCode, stores: [], calls };
      for (const store of parsed.stores) stores.set(store.id, store);
      if (page * 1000 >= responseTotal(fetched.payload)) break;
      page += 1;
    } while (page <= 20);
  }
  return { status: "ok", httpStatus, resultCode, stores: Array.from(stores.values()), calls };
}
