/**
 * 서울 열린데이터광장(openapi.seoul.go.kr) "서울시 일반음식점 인허가 정보"(서비스명
 * LOCALDATA_072404)로 서울시 일반음식점 인허가 정보를 직접 가져옵니다. 2026-08-19 실제
 * 서비스키로 호출해 필드명과 좌표계를 모두 확인했습니다(추정이 아닙니다) — 응답 예:
 * {"LOCALDATA_072404":{"list_total_count":536435,"RESULT":{"CODE":"INFO-000",...},"row":[...]}}
 *
 * 좌표(X/Y)는 중부원점TM(EPSG:5174) 단일 좌표계로 문서화돼 있고(서울시 전체가 이 한 좌표계만
 * 씀), 실제 응답값도 그 범위(X 약 15만~25만, Y 약 40만~55만)와 일치해 검증됐습니다. 전국
 * 단위인 lib/gov-restaurant.ts는 지역별로 좌표계가 다른 것으로 보여 좌표를 쓰지 않았지만, 이
 * 데이터는 서울만 다루고 좌표계가 확정적이라 proj4로 직접 변환해 바로 위경도로 저장합니다 —
 * 리드마다 카카오 지오코더를 호출하지 않아도 돼 더 빠르고 지오코딩 쿼터도 아낍니다.
 *
 * 이 API도 "최근 변경분만" 걸러주는 요청 파라미터는 없어(전체 스냅샷만 제공, 페이지당 최대
 * 1,000행) 응답 안에서 LASTMODTS(최종수정일시) 기준으로 최근 N일 변경분만 골라내고, 시작
 * 페이지를 날짜 기반으로 회전시켜 반복 호출하면 결국 서울 전체(약 53만 건)를 다 훑게 됩니다.
 * 전국판보다 데이터가 훨씬 적어(53만 vs 229만) 완전 커버리지 주기가 더 짧습니다.
 */

import proj4 from "proj4";

const SEOUL_API_BASE = "http://openapi.seoul.go.kr:8088";
const SEOUL_RESTAURANT_SERVICE = "LOCALDATA_072404";
const PAGE_SIZE = 1000; // 서울 열린데이터광장 API의 요청 1회당 최대 건수
const MAX_LOOKBACK_DAYS = 14;

// EPSG:5174 (Korean 1985 / Modified Central Belt, Bessel 1841) — epsg.io/5174.proj4 에서 그대로
// 가져온 정의입니다(직접 유도하지 않음 — 잘못된 towgs84 파라미터는 위치 오차로 이어지므로).
const EPSG_5174 = "+proj=tmerc +lat_0=38 +lon_0=127.002890277778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-145.907,505.034,685.756,-1.162,2.347,1.592,6.342 +units=m +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

function convertTmToWgs84(x: number, y: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  try {
    const [lng, lat] = proj4(EPSG_5174, WGS84, [x, y]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // 대한민국 대략 범위를 벗어나면 변환이 잘못됐을 가능성이 높아 좌표 없이(주소만) 넘깁니다.
    if (lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export type SeoulRestaurantRow = {
  businessName: string;
  permitStatus?: string;
  permitDate?: string;
  openDate?: string;
  closeDate?: string;
  address?: string;
  phone?: string;
  jurisdiction?: string;
  industry?: string;
  latitude?: number;
  longitude?: number;
  lastModified?: string;
};

function getSeoulOpenDataApiKey() {
  return (process.env.SEOUL_OPENDATA_API_KEY || "").trim();
}

export function isSeoulOpenDataConfigured() {
  const key = getSeoulOpenDataApiKey();
  return Boolean(key && key !== "replace-with-seoul-opendata-api-key");
}

function pick(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  return undefined;
}

function mapRow(raw: Record<string, unknown>): SeoulRestaurantRow | null {
  const businessName = pick(raw, "BPLCNM");
  if (!businessName) return null;

  const roadAddress = pick(raw, "RDNWHLADDR");
  const lotAddress = pick(raw, "SITEWHLADDR");
  const permitDate = pick(raw, "APVPERMYMD");
  const closeDate = pick(raw, "DCBYMD");
  const statusName = pick(raw, "DTLSTATENM") || pick(raw, "TRDSTATENM");

  const xRaw = pick(raw, "X");
  const yRaw = pick(raw, "Y");
  const point = xRaw && yRaw ? convertTmToWgs84(Number(xRaw), Number(yRaw)) : null;

  return {
    businessName,
    permitStatus: closeDate ? `${statusName || "폐업"}(${closeDate})` : statusName,
    permitDate,
    openDate: permitDate,
    closeDate,
    address: roadAddress || lotAddress,
    phone: pick(raw, "SITETEL"),
    jurisdiction: pick(raw, "OPNSFTEAMCODE"),
    industry: pick(raw, "UPTAENM"),
    latitude: point?.lat,
    longitude: point?.lng,
    lastModified: pick(raw, "LASTMODTS")
  };
}

async function fetchPage(pageNo: number): Promise<{ rows: Record<string, unknown>[]; totalCount: number } | null> {
  const key = getSeoulOpenDataApiKey();
  if (!key) return null;

  const start = (pageNo - 1) * PAGE_SIZE + 1;
  const end = pageNo * PAGE_SIZE;
  const url = `${SEOUL_API_BASE}/${encodeURIComponent(key)}/json/${SEOUL_RESTAURANT_SERVICE}/${start}/${end}/`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, { list_total_count?: number; row?: Record<string, unknown>[] }>;
    const body = data[SEOUL_RESTAURANT_SERVICE];
    if (!body) return null;
    return { rows: body.row || [], totalCount: body.list_total_count || 0 };
  } catch {
    return null;
  }
}

// 날짜 기반으로 시작 페이지를 회전시켜, 매일 다른 구간을 훑도록 합니다(lib/gov-restaurant.ts와 동일 방식).
function rotateStartPage(totalPages: number, pagesPerRun: number): number {
  if (totalPages <= pagesPerRun) return 1;
  const dayIndex = Math.floor(Date.now() / 86400000);
  const window = dayIndex % Math.max(1, Math.ceil(totalPages / pagesPerRun));
  return 1 + window * pagesPerRun;
}

/**
 * 최근 days일 안에 변경(신규/정정/폐업)된 서울시 일반음식점 행을 가져옵니다. pagesPerRun
 * 페이지(기본 30페이지 = 30,000행)만 스캔하고 LASTMODTS 기준으로 최근분만 골라냅니다. 시작
 * 위치는 날짜에 따라 회전해 반복 호출 시 결국 서울 전체(약 53만 건)를 다 훑게 됩니다.
 */
export async function fetchRecentSeoulRestaurantRows(days = 3, pagesPerRun = 30): Promise<SeoulRestaurantRow[]> {
  if (!isSeoulOpenDataConfigured()) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Math.min(days, MAX_LOOKBACK_DAYS)));

  const first = await fetchPage(1);
  if (!first) return [];
  const totalPages = Math.max(1, Math.ceil(first.totalCount / PAGE_SIZE));
  const startPage = rotateStartPage(totalPages, pagesPerRun);

  const rows: SeoulRestaurantRow[] = [];
  for (let offset = 0; offset < pagesPerRun; offset += 1) {
    const pageNo = ((startPage - 1 + offset) % totalPages) + 1;
    const page = pageNo === 1 ? first : await fetchPage(pageNo);
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

  return rows;
}
