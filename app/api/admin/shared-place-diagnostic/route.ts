import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DATASETS = ["general_restaurants", "rest_cafes", "bakeries", "group_meal_facilities", "contract_catering"] as const;
const TARGET_PROVINCES = ["서울", "경기", "인천"] as const;
const PAGE_SIZE = 1000;
const SAMPLE_PAGES = 30;

type ApiPage = { total: number; rows: Array<Record<string, unknown>> };

function textOf(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function fetchPage(dataset: string, pageNo: number, key: string): Promise<ApiPage> {
  const url = new URL(`https://apis.data.go.kr/1741000/${dataset}/info`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(PAGE_SIZE));
  url.searchParams.set("type", "json");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`${dataset}: HTTP ${response.status}`);
  const data = (await response.json()) as { response?: { body?: { totalCount?: number; items?: { item?: Array<Record<string, unknown>> } } } };
  return { total: Number(data.response?.body?.totalCount || 0), rows: data.response?.body?.items?.item || [] };
}

function isActive(row: Record<string, unknown>) {
  const status = textOf(row, ["DTL_SALS_STTS_NM", "SALS_STTS_NM"]);
  const closeDate = textOf(row, ["CLSBIZ_YMD"]);
  return !closeDate && /영업|정상/.test(status);
}

function isTargetProvince(row: Record<string, unknown>) {
  const address = textOf(row, ["ROAD_NM_ADDR", "LOTNO_ADDR"]);
  return TARGET_PROVINCES.some((province) => address.startsWith(province));
}

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const key = (process.env.GOV_RESTAURANT_API_KEY || "").trim();
  if (!key) return NextResponse.json({ message: "API key is not configured" }, { status: 503 });

  const results = await Promise.all(DATASETS.map(async (dataset) => {
    const first = await fetchPage(dataset, 1, key);
    const totalPages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
    const pages = Array.from({ length: Math.min(SAMPLE_PAGES, totalPages) }, (_, index) =>
      1 + Math.floor((index * Math.max(0, totalPages - 1)) / Math.max(1, SAMPLE_PAGES - 1))
    );
    const uniquePages = [...new Set(pages)];
    const samples = await Promise.all(uniquePages.map((page) => page === 1 ? first : fetchPage(dataset, page, key)));
    const rows = samples.flatMap((page) => page.rows);
    const active = rows.filter(isActive);
    const target = active.filter(isTargetProvince);
    return {
      dataset,
      totalCount: first.total,
      sampleRows: rows.length,
      activeSample: active.length,
      targetProvinceActiveSample: target.length,
      estimatedActive: Math.round(first.total * active.length / Math.max(1, rows.length)),
      estimatedTargetProvinceActive: Math.round(first.total * target.length / Math.max(1, rows.length)),
      sampledPages: uniquePages.length,
      calls: uniquePages.length
    };
  }));
  return NextResponse.json({ measuredAt: new Date().toISOString(), targetProvinces: TARGET_PROVINCES, method: "30-page stratified sample", calls: results.reduce((sum, item) => sum + item.calls, 0), results });
}
