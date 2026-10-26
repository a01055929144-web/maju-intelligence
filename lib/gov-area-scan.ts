import { GOV_OPEN_AUTHORITY_CODES } from "./gov-area-codes";

export type GovDataset = "general_restaurants" | "rest_cafes" | "bakeries" | "group_meal_facilities" | "contract_catering";
export type GovUpdateKind = "insert" | "update" | "delete" | "unknown";
export type GovAreaCursor = { areaCode: string; page: number; cutoff: string; scanStartedAt: string };
// API 요청 제한(25초) 뒤 ingest와 상태 기록이 Hobby 60초 안에 끝나도록 전체 실행을 한 페이지로 제한한다.
export const GOV_SYNC_MAX_PAGES_PER_RUN = 1;

export function govLastSuccessRunQuery(companyId: string) {
  return `lead_sync_runs?select=started_at,finished_at,fetched_count,status,metadata&company_id=eq.${encodeURIComponent(companyId)}&source=eq.gov&status=eq.success&order=started_at.desc&limit=1`;
}

export function canScanNextGovArea(scannedPages: number, pageLimit: number) {
  return scannedPages < pageLimit;
}

export function getGovAreaCodes(salesAreas: readonly string[]): { codes: string[]; missing: string[] } {
  const codes = new Set<string>();
  const missing: string[] = [];
  for (const area of salesAreas) {
    const exact = GOV_OPEN_AUTHORITY_CODES[area];
    if (exact) {
      codes.add(exact);
      continue;
    }
    if (!area.split(" ")[1]) {
      // 이 표는 기존 수집 데이터에서 만들어졌으므로 시·도 전체를 완전하게 포괄한다고 보장할 수 없다.
      // 일부 하위 지역만 조용히 수집하는 대신 미확인으로 돌려 호출자가 실패로 기록하게 한다.
      missing.push(area);
      continue;
    }
    const tokens = area.split(" ");
    const parent = tokens.length >= 3 ? GOV_OPEN_AUTHORITY_CODES[tokens.slice(0, 2).join(" ")] : undefined;
    if (parent) codes.add(parent);
    else missing.push(area);
  }
  return { codes: Array.from(codes), missing };
}

export function getGovAreaCoverageStatus(missing: readonly string[]): "success" | "error" {
  return missing.length ? "error" : "success";
}

export function resolveGovAreaScanWindow(options: {
  codes: readonly string[];
  savedCursor?: GovAreaCursor | null;
  startedAt: string;
  previousFinishedAt?: string | null;
  lookbackDays: number;
}) {
  const cursor = options.savedCursor && options.codes.includes(options.savedCursor.areaCode)
    ? options.savedCursor
    : undefined;
  return {
    cursor,
    scanStartedAt: cursor?.scanStartedAt || options.startedAt,
    cutoff: cursor?.cutoff
      ? new Date(cursor.cutoff)
      : getGovChangeCutoff(new Date(options.startedAt), options.previousFinishedAt, options.lookbackDays),
    startIndex: cursor ? options.codes.indexOf(cursor.areaCode) : 0
  };
}

export function getGovChangeCutoff(now: Date, lastSuccess?: string | null, lookbackDays = 14) {
  const oldest = now.getTime() - Math.max(1, Math.min(14, lookbackDays)) * 86400000;
  const previous = lastSuccess ? Date.parse(lastSuccess) - 86400000 : oldest;
  return new Date(Math.max(oldest, Number.isFinite(previous) ? previous : oldest));
}

export function parseGovModifiedAt(value?: string) {
  if (!value) return null;
  const normalized = value.trim().replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}+09:00`;
  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getGovUpdateKind(value?: string): GovUpdateKind {
  return value === "I" ? "insert" : value === "U" ? "update" : value === "D" ? "delete" : "unknown";
}

export type GovAreaPage<T> = { rows: T[]; totalCount: number };
export type GovAreaScan<T> = {
  rows: T[];
  nextPage: number | null;
  scannedPages: number;
  totalPages: number;
  reachedCutoff: boolean;
};

/** /info의 최신순을 이용한다. 실패한 페이지에서는 커서를 전진시키지 않는다. */
export async function scanGovArea<T>(options: {
  startPage?: number;
  maxPages: number;
  pageSize: number;
  cutoff?: Date;
  modifiedAt: (row: T) => string | undefined;
  load: (page: number) => Promise<GovAreaPage<T>>;
  shouldStop?: () => boolean;
}): Promise<GovAreaScan<T>> {
  const startPage = Math.max(1, options.startPage || 1);
  const rows: T[] = [];
  let totalPages = startPage;
  let scannedPages = 0;
  let reachedCutoff = false;
  for (let pageNo = startPage; scannedPages < options.maxPages; pageNo += 1) {
    if (scannedPages > 0 && options.shouldStop?.()) {
      return { rows, nextPage: pageNo, scannedPages, totalPages, reachedCutoff };
    }
    let page: GovAreaPage<T>;
    try {
      page = await options.load(pageNo);
    } catch (error) {
      if (!scannedPages) throw error;
      return { rows, nextPage: pageNo, scannedPages, totalPages, reachedCutoff };
    }
    scannedPages += 1;
    totalPages = Math.max(1, Math.ceil(page.totalCount / options.pageSize));
    for (const row of page.rows) {
      const modified = parseGovModifiedAt(options.modifiedAt(row));
      if (options.cutoff && modified && modified < options.cutoff) {
        reachedCutoff = true;
        break;
      }
      rows.push(row);
    }
    if (reachedCutoff || pageNo >= totalPages || page.rows.length === 0) {
      return { rows, nextPage: null, scannedPages, totalPages, reachedCutoff };
    }
  }
  return { rows, nextPage: startPage + scannedPages, scannedPages, totalPages, reachedCutoff };
}
