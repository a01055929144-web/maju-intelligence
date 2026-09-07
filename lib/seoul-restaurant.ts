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
// 페이지를 순차로 하나씩 기다리면(await 30번) 응답 시간이 API 지연에 비례해 늘어나 Vercel 함수
// 시간 제한(60초)을 넘기기 쉽습니다 — 실제로 라이브 테스트에서 타임아웃이 재현됐습니다(2026-08-19).
// FETCH_CONCURRENCY만큼 동시에 요청하고, TIME_BUDGET_MS를 넘기면 지금까지 모은 행만으로 즉시
// 반환합니다(다음 실행이 rotateStartPage로 이어서 훑으므로 데이터 유실은 아니고 진행이 느려질 뿐).
const FETCH_CONCURRENCY = 5;
// 2026-09-07 피드백("자동 수집에 실패했습니다" — 화면에 뜬 문구가 서버가 실제로 내려주는 어떤
// 에러 메시지와도 일치하지 않아, 응답이 JSON이 아니었다는 뜻입니다. 즉 라우트가 던진 에러가
// 아니라 Vercel 함수 실행 시간 제한에 걸려 죽었을 가능성이 가장 큽니다). 예전에 "45초 스캔 +
// ingest로 총 48.9초"까지 나온 적이 있다는 기록으로 볼 때 60초 한도에 여유가 있었지만, 그날그날
// 회전 구간(rotateStartPage)에 "최근 변경분"이 유난히 많이 몰리면 스캔한 행 수만큼 DB 적재
// (ingest) 시간도 비례해 늘어나 가끔 60초를 넘길 수 있습니다(전국 공공데이터 lib/gov-restaurant.ts와
// 동일한 구조라 같은 위험이 있습니다). 스캔 예산을 20초로 더 줄이고, 한 번에 적재할 행 수에도
// 상한(MAX_ROWS_PER_RUN)을 둬 ingest 소요 시간을 예측 가능한 범위로 묶습니다 — 상한에 걸려 못
// 다 훑은 나머지는 데이터가 사라지는 게 아니라 다음 실행으로 미뤄질 뿐입니다.
// 2026-09-07 피드백("전국 다 훑는데 시간이 오래 걸리면 시간을 넉넉히 줘도 된다") 대응: gov-restaurant.ts와
// 같은 이유로(야간 cron에서 이 작업과 병렬로 도는 다른 작업들은 보통 가볍게 끝남) 35초로 올립니다.
const TIME_BUDGET_MS = 35_000;
const MAX_ROWS_PER_RUN = 4000;

export type SeoulRestaurantFetchResult = {
  rows: SeoulRestaurantRow[];
  // 2026-09-07 피드백 대응(lib/gov-restaurant.ts와 동일한 이유) — nextStartPage를 돌려줘서 화면이
  // "계속 가져오기"로 바로 다음 구간을 이어서 요청할 수 있게 합니다.
  nextStartPage: number;
  scannedPages: number;
  startPage: number;
  totalPages: number;
};

export async function fetchRecentSeoulRestaurantRows(
  days = 3,
  pagesPerRun = 150,
  startPageOverride?: number
): Promise<SeoulRestaurantFetchResult> {
  const empty = { rows: [] as SeoulRestaurantRow[], nextStartPage: 1, scannedPages: 0, startPage: 1, totalPages: 1 };
  if (!isSeoulOpenDataConfigured()) return empty;

  const startedAt = Date.now();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Math.min(days, MAX_LOOKBACK_DAYS)));

  const first = await fetchPage(1);
  if (!first) return empty;
  const totalPages = Math.max(1, Math.ceil(first.totalCount / PAGE_SIZE));
  const startPage =
    startPageOverride && startPageOverride >= 1 && startPageOverride <= totalPages
      ? startPageOverride
      : rotateStartPage(totalPages, pagesPerRun);
  const pageNumbers = Array.from({ length: pagesPerRun }, (_, offset) => ((startPage - 1 + offset) % totalPages) + 1);

  const rows: SeoulRestaurantRow[] = [];
  let scannedPages = 0;
  for (let i = 0; i < pageNumbers.length; i += FETCH_CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    if (rows.length >= MAX_ROWS_PER_RUN) break;
    const batch = pageNumbers.slice(i, i + FETCH_CONCURRENCY);
    const pages = await Promise.all(batch.map((pageNo) => (pageNo === 1 ? Promise.resolve(first) : fetchPage(pageNo))));
    scannedPages += batch.length;
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

  const nextStartPage = ((startPage - 1 + scannedPages) % totalPages) + 1;
  return {
    rows: rows.length > MAX_ROWS_PER_RUN ? rows.slice(0, MAX_ROWS_PER_RUN) : rows,
    nextStartPage,
    scannedPages,
    startPage,
    totalPages
  };
}
