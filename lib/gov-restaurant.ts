/**
 * 행정안전부_식품_일반음식점 조회서비스(공공데이터포털, apis.data.go.kr/1741000/general_restaurants)로
 * 전국 일반음식점 인허가 정보를 직접 가져옵니다. 실제 발급받은 서비스키로 응답을 확인하고
 * 필드명을 검증했습니다(2026-08-19, 샘플 조회 결과 기준). (예전에 별도 소스였던
 * localdata.go.kr은 2026-04-16 폐쇄되어 lib/localdata.ts와 함께 2026-08-24 제거했습니다 — 이
 * 공공데이터포털 API가 그 역할을 대신합니다.)
 *
 * 좌표(CRD_INFO_X/Y)는 지역마다 다른 좌표계를 쓰는 것으로 보여(제주 지역 샘플 값이 표준
 * 중부원점TM 범위를 벗어남) 잘못된 위치로 지도에 표시될 위험이 있어 이번엔 사용하지 않습니다.
 * 대신 기존 파이프라인(lib/store.ts의 resolveLeadPoint → 카카오 지오코더)이 주소 텍스트만으로
 * lazy하게 좌표를 채우는 방식을 그대로 재사용합니다 — 수동 엑셀 업로드 리드와 동일한 경로입니다.
 *
 * /info의 개방자치단체코드 조건과 최신순 정렬을 사용해 회사 영업 지역만 조회합니다.
 */

import { getGovUpdateKind, scanGovArea, type GovDataset } from "./gov-area-scan";
import { GovApiResponseError, parseGovApiFailure } from "./gov-api-response";


/**
 * 행정안전부 1741000 API는 정상 응답의 resultCode가 "0"이다(구형 공공데이터 API는 "00").
 * 둘 다 정상으로 본다. 코드가 없으면 본문 검사에 맡긴다.
 */
export function isGovSuccessResultCode(code?: string | null) {
  if (code === undefined || code === null || code === "") return true;
  return /^0+$/.test(String(code).trim());
}

export const GOV_DATASETS = ["general_restaurants", "rest_cafes", "bakeries", "group_meal_facilities", "contract_catering"] as const;
const PAGE_SIZE = 100;

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
  sourceRecordKey?: string;
  updateKind?: ReturnType<typeof getGovUpdateKind>;
  salesStatusCode?: string;
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
  const updateKind = getGovUpdateKind(pick(raw, ["DAT_UPDT_SE"]));
  const salesStatusCode = pick(raw, ["SALS_STTS_CD"]);

  return {
    businessName,
    permitStatus: closeDate
      ? `${statusName || "폐업"}(${closeDate})`
      : updateKind === "delete" || salesStatusCode === "03" || salesStatusCode === "04"
        ? "폐업"
        : salesStatusCode === "02" ? "휴업" : statusName,
    permitDate,
    openDate: permitDate,
    closeDate,
    address: roadAddress || lotAddress,
    phone: pick(raw, ["TELNO"]),
    jurisdiction: pick(raw, ["OPN_ATMY_GRP_CD"]),
    industry: pick(raw, ["BZSTAT_SE_NM", "SNTTN_BZSTAT_NM"]),
    lastModified: pick(raw, ["LAST_MDFCN_PNT", "DAT_UPDT_PNT"]),
    sourceRecordKey: pick(raw, ["MGTNO", "MNG_NO"]),
    updateKind,
    salesStatusCode
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


export type GovAreaFetchResult = {
  rows: GovRestaurantRow[];
  nextPage: number | null;
  scannedPages: number;
  totalPages: number;
};

/** 영업 지역 코드만 요청한다. 첫 적재는 영업 중만, 이후 변경분은 폐업도 받아야 한다. */
export async function fetchGovAreaRows(input: {
  dataset: GovDataset;
  areaCode: string;
  startPage?: number;
  maxPages: number;
  cutoff?: Date;
  activeOnly?: boolean;
  shouldStop?: () => boolean;
  timeoutMs?: number;
  retry?: boolean;
}): Promise<GovAreaFetchResult> {
  const key = getGovRestaurantApiKey();
  if (!key) throw new Error("정부 음식점 API 키가 없습니다.");
  if (!/^\d{7}$/.test(input.areaCode)) throw new Error("개방자치단체코드가 올바르지 않습니다.");
  const pageSize = PAGE_SIZE;
  const result = await scanGovArea<Record<string, unknown>>({
    startPage: input.startPage,
    maxPages: input.maxPages,
    pageSize,
    cutoff: input.cutoff,
    shouldStop: input.shouldStop,
    modifiedAt: (row) => pick(row, ["DAT_UPDT_PNT", "LAST_MDFCN_PNT"]),
    load: (pageNo) => fetchGovPageWithRetry(pageNo, async () => {
      const url = new URL(`https://apis.data.go.kr/1741000/${input.dataset}/info`);
      url.searchParams.set("serviceKey", key);
      url.searchParams.set("pageNo", String(pageNo));
      url.searchParams.set("numOfRows", String(pageSize));
      url.searchParams.set("type", "json");
      url.searchParams.set("cond[OPN_ATMY_GRP_CD::EQ]", input.areaCode);
      if (input.activeOnly) url.searchParams.set("cond[SALS_STTS_CD::EQ]", "01");
      const startedAt = performance.now();
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(input.timeoutMs || 25_000) });
      if (!response.ok) {
        throw new GovApiResponseError(
          response.status,
          parseGovApiFailure(await response.text(), key),
          Math.round(performance.now() - startedAt)
        );
      }
      const data = (await response.json()) as GovRestaurantApiResponse;
      const code = data.response?.header?.resultCode;
      if (!isGovSuccessResultCode(code)) {
        throw new GovApiResponseError(
          response.status,
          parseGovApiFailure(JSON.stringify({ response: { header: data.response?.header } }), key),
          Math.round(performance.now() - startedAt)
        );
      }
      if (!data.response?.body) throw new Error(`${input.dataset} API 응답 본문이 없습니다.`);
      const rows = data.response.body.items?.item || [];
      if (rows.some((row) => pick(row, ["OPN_ATMY_GRP_CD"]) !== input.areaCode)) {
        throw new Error(`${input.dataset} API가 요청한 시군구 조건을 적용하지 않았습니다.`);
      }
      if (input.activeOnly && rows.some((row) => pick(row, ["SALS_STTS_CD"]) !== "01")) {
        throw new Error(`${input.dataset} API가 영업 상태 조건을 적용하지 않았습니다.`);
      }
      return { rows, totalCount: Number(data.response.body.totalCount || 0) };
    }, input.retry !== false)
  });
  return {
    rows: result.rows.map(mapRow).filter((row): row is GovRestaurantRow => row !== null),
    nextPage: result.nextPage,
    scannedPages: result.scannedPages,
    totalPages: result.totalPages
  };
}


export async function fetchGovPageWithRetry<T>(pageNo: number, load: (pageNo: number) => Promise<T>, retry = true): Promise<T> {
  try {
    return await load(pageNo);
  } catch (error) {
    if (!retry) throw error;
    return load(pageNo);
  }
}

export async function fetchGovPagesWithRetry<T>(
  pageNumbers: number[],
  load: (pageNo: number) => Promise<T>
): Promise<{ pages: Array<{ pageNo: number; value: Awaited<T> }>; skippedPages: number[] }> {
  const settled = await Promise.all(pageNumbers.map(async (pageNo) => {
    try {
      return { pageNo, value: await load(pageNo) };
    } catch {
      try {
        return { pageNo, value: await load(pageNo) };
      } catch {
        return null;
      }
    }
  }));
  return {
    pages: settled.filter((item): item is { pageNo: number; value: Awaited<T> } => item !== null),
    skippedPages: pageNumbers.filter((pageNo) => !settled.some((item) => item?.pageNo === pageNo))
  };
}
