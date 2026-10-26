import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseRequest } from "@/lib/store";
import { GovApiResponseError, parseGovApiFailure } from "@/lib/gov-api-response";
import { isGovSuccessResultCode } from "@/lib/gov-restaurant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATASETS = ["general_restaurants", "rest_cafes", "bakeries", "group_meal_facilities", "contract_catering"] as const;
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_SAMPLE_PAGES = 30;
const GENERAL_RESTAURANT_PAGE_SIZE = 200;
const GENERAL_RESTAURANT_SAMPLE_PAGES = 10;

type ApiPage = { total: number; rows: Array<Record<string, unknown>>; responseCode: number; elapsedMs: number };

function textOf(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function fetchPage(
  dataset: string,
  pageNo: number,
  pageSize: number,
  key: string,
  condition?: { areaCode: string; statusCode?: string }
): Promise<ApiPage> {
  const url = new URL(`https://apis.data.go.kr/1741000/${dataset}/info`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(pageSize));
  url.searchParams.set("type", "json");
  if (condition) {
    url.searchParams.set("cond[OPN_ATMY_GRP_CD::EQ]", condition.areaCode);
    if (condition.statusCode) url.searchParams.set("cond[SALS_STTS_CD::EQ]", condition.statusCode);
  }
  const startedAt = performance.now();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const failure = parseGovApiFailure(await response.text(), key);
    throw new GovApiResponseError(response.status, failure, elapsedMs);
  }
  const data = (await response.json()) as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { totalCount?: number; items?: { item?: Array<Record<string, unknown>> } };
    };
  };
  if (!isGovSuccessResultCode(data.response?.header?.resultCode)) {
    const failure = parseGovApiFailure(JSON.stringify({ response: { header: data.response?.header } }), key);
    throw new GovApiResponseError(response.status, failure, elapsedMs);
  }
  return {
    total: Number(data.response?.body?.totalCount || 0),
    rows: data.response?.body?.items?.item || [],
    responseCode: response.status,
    elapsedMs
  };
}

function isActive(row: Record<string, unknown>) {
  const status = textOf(row, ["DTL_SALS_STTS_NM", "SALS_STTS_NM"]);
  const closeDate = textOf(row, ["CLSBIZ_YMD"]);
  return !closeDate && /영업|정상/.test(status);
}

function isTargetProvince(row: Record<string, unknown>, targetProvinces: string[]) {
  const address = textOf(row, ["ROAD_NM_ADDR", "LOTNO_ADDR"]);
  return targetProvinces.some((province) => address.startsWith(province));
}

async function getTargetProvinces() {
  const [regions, territories, companies] = await Promise.all([
    supabaseRequest<Array<{ label: string | null }>>("company_lead_search_regions?select=label&limit=5000").catch(() => []),
    supabaseRequest<Array<{ administrative_area: string | null }>>("delivery_territory_areas?select=administrative_area&limit=5000").catch(() => []),
    supabaseRequest<Array<{ origin_address: string | null }>>("companies?select=origin_address&status=neq.closed&limit=1000").catch(() => [])
  ]);
  const aliases: Record<string, string> = { 서울: "서울특별시", 경기: "경기도", 인천: "인천광역시" };
  const values = [...regions.map((row) => row.label), ...territories.map((row) => row.administrative_area), ...companies.map((row) => row.origin_address)];
  return Array.from(new Set(values.map((value) => String(value || "").trim().split(/\s+/)[0]).filter(Boolean).map((value) => aliases[value] || value)));
}

export async function GET(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const key = (process.env.GOV_RESTAURANT_API_KEY || "").trim();
  if (!key) return NextResponse.json({ message: "API key is not configured" }, { status: 503 });
  const requestUrl = new URL(request.url);
  const requestedDataset = requestUrl.searchParams.get("dataset");
  if (!requestedDataset || !DATASETS.includes(requestedDataset as (typeof DATASETS)[number])) {
    return NextResponse.json({ message: "dataset 쿼리가 필요합니다.", datasets: DATASETS }, { status: 400 });
  }
  const dataset = requestedDataset as (typeof DATASETS)[number];
  const conditionMode = requestUrl.searchParams.get("mode") === "cond";
  const probeOnly = requestUrl.searchParams.get("mode") === "probe";
  const pageSize = dataset === "general_restaurants" ? GENERAL_RESTAURANT_PAGE_SIZE : DEFAULT_PAGE_SIZE;
  const samplePageCount = dataset === "general_restaurants" ? GENERAL_RESTAURANT_SAMPLE_PAGES : DEFAULT_SAMPLE_PAGES;
  const areaCode = requestUrl.searchParams.get("areaCode") || "";
  const statusCode = requestUrl.searchParams.get("statusCode") || "";
  if (conditionMode && (!/^\d{7}$/.test(areaCode) || (statusCode && !/^\d{2}$/.test(statusCode)))) {
    return NextResponse.json({ message: "areaCode는 7자리, statusCode는 2자리 숫자여야 합니다." }, { status: 400 });
  }
  const targetProvinces = conditionMode ? [] : await getTargetProvinces();
  try {
    const first = await fetchPage(
      dataset, 1, probeOnly || conditionMode ? 10 : pageSize, key,
      conditionMode ? { areaCode, statusCode: statusCode || undefined } : undefined
    );
    if (probeOnly || conditionMode) {
      return NextResponse.json({
        measuredAt: new Date().toISOString(),
        dataset,
        pageNo: 1,
        pageSize: 10,
        responseCode: first.responseCode,
        elapsedMs: first.elapsedMs,
        executedOn: process.env.VERCEL ? "vercel-server" : "local-server",
        returnedRows: first.rows.length,
        totalCount: first.total,
        ...(conditionMode ? {
          areaCode,
          statusCode: statusCode || null,
          allRowsMatchArea: first.rows.every((row) => textOf(row, ["OPN_ATMY_GRP_CD"]) === areaCode),
          allRowsMatchStatus: statusCode ? first.rows.every((row) => textOf(row, ["SALS_STTS_CD"]) === statusCode) : null,
          newestModifiedAt: textOf(first.rows[0] || {}, ["DAT_UPDT_PNT", "LAST_MDFCN_PNT"])
        } : {})
      });
    }
    const totalPages = Math.max(1, Math.ceil(first.total / pageSize));
    const pages = Array.from({ length: Math.min(samplePageCount, totalPages) }, (_, index) =>
      1 + Math.floor((index * Math.max(0, totalPages - 1)) / Math.max(1, samplePageCount - 1))
    );
    const uniquePages = Array.from(new Set(pages));
    const samples = await Promise.all(uniquePages.map((page) => page === 1 ? first : fetchPage(dataset, page, pageSize, key)));
    const rows = samples.flatMap((page) => page.rows);
    const active = rows.filter(isActive);
    const target = active.filter((row) => isTargetProvince(row, targetProvinces));
    const result = {
      dataset,
      totalCount: first.total,
      sampleRows: rows.length,
      activeSample: active.length,
      targetProvinceActiveSample: target.length,
      estimatedActive: Math.round(first.total * active.length / Math.max(1, rows.length)),
      estimatedTargetProvinceActive: Math.round(first.total * target.length / Math.max(1, rows.length)),
      sampledPages: uniquePages.length,
      pageSize,
      calls: uniquePages.length
    };
    return NextResponse.json({
      measuredAt: new Date().toISOString(),
      targetProvinces,
      method: `${uniquePages.length}-page stratified sample (estimate)`,
      calls: result.calls,
      result
    });
  } catch (error) {
    return NextResponse.json({
      dataset,
      message: error instanceof Error ? error.message : "측정 실패",
      targetProvinces,
      ...(error instanceof GovApiResponseError ? {
        upstreamStatus: error.status,
        upstreamResultCode: error.failure.resultCode,
        upstreamResultMessage: error.failure.resultMessage,
        elapsedMs: error.elapsedMs,
        executedOn: process.env.VERCEL ? "vercel-server" : "local-server"
      } : {})
    }, { status: 502 });
  }
}
