/**
 * 행정안전부_식품_일반음식점 조회서비스(공공데이터포털, apis.data.go.kr/1741000/general_restaurants)로
 * 전국 일반음식점 인허가 정보를 직접 가져옵니다. localdata.go.kr(lib/localdata.ts)이 여전히 사용자가
 * 직접 authKey를 신청해야 하는 것과 달리, 이 API는 실제 발급받은 서비스키로 응답을 확인하고
 * 필드명을 검증했습니다(2026-08-19, 샘플 조회 결과 기준).
 *
 * 좌표(CRD_INFO_X/Y)는 지역마다 다른 좌표계를 쓰는 것으로 보여(제주 지역 샘플 값이 표준
 * 중부원점TM 범위를 벗어남) 잘못된 위치로 지도에 표시될 위험이 있어 이번엔 사용하지 않습니다.
 * 대신 기존 파이프라인(lib/store.ts의 resolveLeadPoint → 카카오 지오코더)이 주소 텍스트만으로
 * lazy하게 좌표를 채우는 방식을 그대로 재사용합니다 — 수동 엑셀 업로드 리드와 동일한 경로입니다.
 *
 * 전국 데이터가 약 229만 건이고(2026-08-19 기준 totalCount), 이 API는 "최근 변경분만" 걸러주는
 * 요청 파라미터가 없습니다(/info는 현재 전체 스냅샷, /history는 과거 특정 기준일 스냅샷). 한 번의
 * 호출로 전체를 훑는 건 비현실적이라, LAST_MDFCN_PNT(최종수정일시) 값으로 응답 안에서만 최근 N일
 * 변경분을 걸러내고, 매 호출마다 시작 페이지를 날짜 기반으로 회전시켜(rotateStartPage) 여러 번
 * 반복 호출하면 전체 데이터를 결국 다 훑도록 설계했습니다. 별도 DB 커서 없이도 동작하지만, 완전
 * 커버리지까지는 며칠~몇 주가 걸릴 수 있습니다.
 */

const GOV_RESTAURANT_URL = "https://apis.data.go.kr/1741000/general_restaurants/info";
const PAGE_SIZE = 1000; // 공공데이터포털 표준 REST API의 일반적인 numOfRows 상한
const MAX_LOOKBACK_DAYS = 14;

export type GovRestaurantRow = {
  businessName: string;
  permitStatus?: string;
  permitDate?: string;
  openDate?: string;
  closeDate?: string;
  address?: string;
  phone?: string;
  jurisdiction?: string;
  industry?: string;
  lastModified?: string;
};

function getGovRestaurantApiKey() {
  return (process.env.GOV_RESTAURANT_API_KEY || "").trim();
}

export function isGovRestaurantApiConfigured() {
  const key = getGovRestaurantApiKey();
  return Boolean(key && key !== "replace-with-gov-restaurant-api-key");
}

function pick(raw: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

// 2026-08-19 실제 서비스키로 호출해 확인한 필드명입니다(추정이 아닙니다).
function mapRow(raw: Record<string, unknown>): GovRestaurantRow | null {
  const businessName = pick(raw, ["BPLC_NM"]);
  if (!businessName) return null;

  const roadAddress = pick(raw, ["ROAD_NM_ADDR"]);
  const lotAddress = pick(raw, ["LOTNO_ADDR"]);
  const permitDate = pick(raw, ["LCPMT_YMD"]);
  const closeDate = pick(raw, ["CLSBIZ_YMD"]);
  const statusName = pick(raw, ["DTL_SALS_STTS_NM", "SALS_STTS_NM"]);

  return {
    businessName,
    permitStatus: closeDate ? `${statusName || "폐업"}(${closeDate})` : statusName,
    permitDate,
    openDate: permitDate,
    closeDate,
    address: roadAddress || lotAddress,
    phone: pick(raw, ["TELNO"]),
    jurisdiction: pick(raw, ["OPN_ATMY_GRP_CD"]),
    industry: pick(raw, ["BZSTAT_SE_NM", "SNTTN_BZSTAT_NM"]),
    lastModified: pick(raw, ["LAST_MDFCN_PNT", "DAT_UPDT_PNT"])
  };
}

type GovRestaurantApiResponse = {
  response?: {
    body?: {
      items?: { item?: Array<Record<string, unknown>> };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
    header?: { resultCode?: string; resultMsg?: string };
  };
};

async function fetchPage(pageNo: number): Promise<{ rows: Record<string, unknown>[]; totalCount: number } | null> {
  const key = getGovRestaurantApiKey();
  if (!key) return null;

  const url = new URL(GOV_RESTAURANT_URL);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(PAGE_SIZE));
  url.searchParams.set("type", "json");

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as GovRestaurantApiResponse;
    const body = data.response?.body;
    if (!body) return null;
    return { rows: body.items?.item || [], totalCount: body.totalCount || 0 };
  } catch {
    return null;
  }
}

// 날짜 기반으로 시작 페이지를 회전시켜, 매일 다른 구간을 훑도록 합니다. pagesPerRun만큼 진행하면
// 다음 실행에서는 그 바로 다음 구간부터 이어갑니다(전체 페이지 수를 넘으면 처음으로 순환).
function rotateStartPage(totalPages: number, pagesPerRun: number): number {
  if (totalPages <= pagesPerRun) return 1;
  const dayIndex = Math.floor(Date.now() / 86400000);
  const window = dayIndex % Math.max(1, Math.ceil(totalPages / pagesPerRun));
  return 1 + window * pagesPerRun;
}

/**
 * 최근 days일 안에 변경(신규/정정/폐업)된 음식점 행을 가져옵니다. 전체 229만 건을 매번 다 훑을 수
 * 없어 pagesPerRun 페이지(기본 30페이지 = 30,000행)만 스캔하고, 그 안에서 LAST_MDFCN_PNT 기준으로
 * 최근분만 골라냅니다. 시작 위치는 날짜에 따라 회전해 반복 호출 시 결국 전국을 다 훑게 됩니다.
 */
// 페이지를 순차로 하나씩 기다리면(await 30번) 응답 시간이 API 지연에 비례해 늘어나 Vercel 함수
// 시간 제한(60초)을 넘기기 쉽습니다 — 서울시 공공데이터 쪽에서 실제로 타임아웃이 재현됐습니다
// (2026-08-19). FETCH_CONCURRENCY만큼 동시에 요청하고, TIME_BUDGET_MS를 넘기면 지금까지 모은
// 행만으로 즉시 반환합니다(다음 실행이 rotateStartPage로 이어서 훑으므로 데이터 유실은 아니고
// 진행이 느려질 뿐입니다).
const FETCH_CONCURRENCY = 5;
const TIME_BUDGET_MS = 45_000;

export async function fetchRecentGovRestaurantRows(days = 3, pagesPerRun = 30): Promise<GovRestaurantRow[]> {
  if (!isGovRestaurantApiConfigured()) return [];

  const startedAt = Date.now();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Math.min(days, MAX_LOOKBACK_DAYS)));

  const first = await fetchPage(1);
  if (!first) return [];
  const totalPages = Math.max(1, Math.ceil(first.totalCount / PAGE_SIZE));
  const startPage = rotateStartPage(totalPages, pagesPerRun);
  const pageNumbers = Array.from({ length: pagesPerRun }, (_, offset) => ((startPage - 1 + offset) % totalPages) + 1);

  const rows: GovRestaurantRow[] = [];
  for (let i = 0; i < pageNumbers.length; i += FETCH_CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const batch = pageNumbers.slice(i, i + FETCH_CONCURRENCY);
    const pages = await Promise.all(batch.map((pageNo) => (pageNo === 1 ? Promise.resolve(first) : fetchPage(pageNo))));
    for (const page of pages) {
      if (!page?.rows?.length) continue;
      for (const raw of page.rows) {
        const mapped = mapRow(raw);
        if (!mapped) continue;
        if (mapped.lastModified) {
          const modified = new Date(mapped.lastModified.replace(" ", "T"));
          if (!Number.isNaN(modified.getTime()) && modified < cutoff) continue;
        }
        rows.push(mapped);
      }
    }
  }

  return rows;
}
