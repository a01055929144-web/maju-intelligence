/**
 * 지방행정 인허가 데이터개방(localdata.go.kr) Open API로 신규/변경된 인허가 정보를 직접 가져옵니다.
 * 지금까지 "신규 리드" 기능은 사용자가 공공데이터포털/localdata.go.kr에서 엑셀을 내려받아
 * 수동 업로드하는 방식(app/api/leads/permits POST)만 있었는데, 이 모듈은 같은 데이터를 API로
 * 직접 당겨와 같은 파이프라인(lib/store.ts의 ingestPermitLeadRows)에 흘려보내는 자동화 경로를
 * 추가합니다. 수동 업로드는 그대로 남겨두고, 이 모듈이 실패하거나 키가 없으면 조용히 빈 결과를
 * 반환해 수동 업로드 경로에 영향을 주지 않습니다(lib/business-status.ts, lib/tmap.ts와 동일한
 * graceful-degradation 패턴).
 *
 * ⚠️ 중요: 이 파일은 실제 인증키로 응답을 검증하지 못한 상태로 작성되었습니다. localdata.go.kr
 * 개발자센터 문서와 공개된 요청/응답 예시를 기준으로 필드명을 반영했지만, 필드명이 조금씩 다른
 * 사례가 보고되어 있어(업종/개방자치단체별 스키마 차이 가능) 실제 인증키를 발급받은 뒤 첫 호출
 * 결과를 콘솔 로그(mapRow가 남기는 unmappedSampleKeys)로 반드시 확인하고, 필요하면 아래
 * FIELD_CANDIDATES를 보정해야 합니다.
 */

const LOCALDATA_BASE_URL = "https://www.localdata.go.kr/platform/rest/GR0/openDataApi";

// localdata.go.kr API가 한 번에 허용하는 최대 페이지 크기와, lastModTsBgn~End 범위 제한(최대 31일)입니다.
const PAGE_SIZE = 500;
const MAX_LOOKBACK_DAYS = 30;
const MAX_PAGES_PER_CALL = 20; // 무한 루프 방지용 안전장치(최대 10,000행/업종/호출)

export type LocalDataPermitRow = {
  businessName: string;
  businessNumber?: string;
  representativeName?: string;
  permitStatus?: string;
  permitDate?: string;
  openDate?: string;
  address?: string;
  phone?: string;
  jurisdiction?: string;
  industry?: string;
  latitude?: number;
  longitude?: number;
};

function getLocalDataApiKey() {
  return (process.env.LOCALDATA_API_KEY || "").trim();
}

export function isLocalDataApiConfigured() {
  const key = getLocalDataApiKey();
  return Boolean(key && key !== "replace-with-localdata-api-key");
}

// 기본 대상 업종(식자재 유통 영업 대상): 일반음식점, 휴게음식점, 제과점영업.
// 환경변수 LOCALDATA_OPN_SVC_IDS(콤마 구분)로 업종 코드를 바꾸거나 늘릴 수 있습니다.
// 업종 코드는 localdata.go.kr > 데이터셋 상세 화면의 opnSvcId 값을 그대로 사용하세요.
const DEFAULT_OPN_SVC_IDS = ["07_24_04_P", "07_24_05_P", "07_24_02_P"];

export function getConfiguredOpnSvcIds(): string[] {
  const raw = (process.env.LOCALDATA_OPN_SVC_IDS || "").trim();
  if (!raw) return DEFAULT_OPN_SVC_IDS;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatDateYyyymmdd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// 응답 필드명이 업종/버전에 따라 다르게 보고된 사례가 있어, 후보 키를 순서대로 확인합니다.
const FIELD_CANDIDATES = {
  businessName: ["bplcnm", "bizNm", "wrkplcNm"],
  businessNumber: ["bizrno", "businessNumber", "brNo"],
  representativeName: ["prsdntnm", "reprsvNm", "presidentName"],
  permitStatus: ["trdstatenm", "dtlstatenm", "trdStateNm"],
  permitDate: ["apvpermymd", "apvPermYmd"],
  closeDate: ["dcbymd", "clsbizYmd"],
  roadAddress: ["rdnwhladdr", "roadAddr"],
  lotAddress: ["sitewhladdr", "lotAddr"],
  phone: ["sitetel", "locplcTelno"],
  jurisdiction: ["opnsfteamcode", "jurisdiction"],
  industry: ["uptaenm", "induty", "indutyCdNm"],
  latitude: ["y", "latitude"],
  longitude: ["x", "longitude"]
} as const;

type RawRow = Record<string, unknown>;

let loggedUnmappedSampleOnce = false;

function pick(row: RawRow, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function mapRow(raw: RawRow): LocalDataPermitRow | null {
  const businessName = pick(raw, FIELD_CANDIDATES.businessName);
  if (!businessName) {
    // 상호명 필드를 하나도 못 찾으면 필드명 후보가 실제 응답과 다르다는 신호입니다.
    // 딱 한 번만 원본 키 목록을 로그로 남겨, 운영 중 필드명 보정에 참고할 수 있게 합니다.
    if (!loggedUnmappedSampleOnce) {
      loggedUnmappedSampleOnce = true;
      console.error("localdata.go.kr 응답에서 상호명 필드를 찾지 못했습니다. 원본 키:", Object.keys(raw));
    }
    return null;
  }

  const roadAddress = pick(raw, FIELD_CANDIDATES.roadAddress);
  const lotAddress = pick(raw, FIELD_CANDIDATES.lotAddress);
  const permitDate = pick(raw, FIELD_CANDIDATES.permitDate);
  const closeDate = pick(raw, FIELD_CANDIDATES.closeDate);
  const lat = pick(raw, FIELD_CANDIDATES.latitude);
  const lng = pick(raw, FIELD_CANDIDATES.longitude);
  const permitStatusRaw = pick(raw, FIELD_CANDIDATES.permitStatus);

  return {
    businessName,
    businessNumber: pick(raw, FIELD_CANDIDATES.businessNumber),
    representativeName: pick(raw, FIELD_CANDIDATES.representativeName),
    permitStatus: closeDate ? `${permitStatusRaw || "폐업"}(${closeDate})` : permitStatusRaw,
    permitDate,
    openDate: permitDate,
    address: roadAddress || lotAddress,
    phone: pick(raw, FIELD_CANDIDATES.phone),
    jurisdiction: pick(raw, FIELD_CANDIDATES.jurisdiction),
    industry: pick(raw, FIELD_CANDIDATES.industry),
    latitude: lat ? Number(lat) : undefined,
    longitude: lng ? Number(lng) : undefined
  };
}

type LocalDataApiResponse = {
  header?: { resultCode?: string; resultMsg?: string };
  currentCount?: number;
  matchCount?: number;
  page?: number;
  perPage?: number;
  rows?: RawRow[];
};

async function fetchPage(opnSvcId: string, pageIndex: number, lastModTsBgn: string, lastModTsEnd: string): Promise<LocalDataApiResponse | null> {
  const key = getLocalDataApiKey();
  if (!key) return null;

  const url = new URL(LOCALDATA_BASE_URL);
  url.searchParams.set("authKey", key);
  url.searchParams.set("opnSvcId", opnSvcId);
  url.searchParams.set("pageIndex", String(pageIndex));
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("resultType", "json");
  url.searchParams.set("lastModTsBgn", lastModTsBgn);
  url.searchParams.set("lastModTsEnd", lastModTsEnd);

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as LocalDataApiResponse;
  } catch {
    return null;
  }
}

/**
 * 지정한 업종(opnSvcId)의 최근 변경분(개업/정정/폐업 포함)을 가져옵니다. days는 조회 범위(일)로,
 * localdata.go.kr API 제한(최대 31일)에 맞춰 최대 30일로 잘립니다. 키가 없거나 요청이 실패하면
 * 빈 배열을 반환합니다(호출자는 별도 에러 처리 없이 안전하게 사용할 수 있습니다).
 */
export async function fetchLocalDataPermitRows(opnSvcId: string, days = 3): Promise<LocalDataPermitRow[]> {
  if (!isLocalDataApiConfigured()) return [];

  const end = new Date();
  const begin = new Date(end);
  begin.setDate(begin.getDate() - Math.max(1, Math.min(days, MAX_LOOKBACK_DAYS)));

  const lastModTsBgn = formatDateYyyymmdd(begin);
  const lastModTsEnd = formatDateYyyymmdd(end);

  const rows: LocalDataPermitRow[] = [];

  for (let pageIndex = 1; pageIndex <= MAX_PAGES_PER_CALL; pageIndex += 1) {
    const page = await fetchPage(opnSvcId, pageIndex, lastModTsBgn, lastModTsEnd);
    if (!page?.rows?.length) break;

    for (const raw of page.rows) {
      const mapped = mapRow(raw);
      if (mapped) rows.push(mapped);
    }

    const matchCount = page.matchCount || 0;
    if (pageIndex * PAGE_SIZE >= matchCount) break;
  }

  return rows;
}
