import { NextRequest, NextResponse } from "next/server";
import { summarizeGovSync, type GovSyncRunRow } from "@/domains/lead/gov-sync-summary";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isProductionStoreConfigured, supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

// CC-60: 공공데이터 수집 상태 읽기 전용. 회사 범위 lead_sync_runs(source=gov) 최근 7일만 읽는다(쓰기 없음).
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  if (!isProductionStoreConfigured()) return NextResponse.json({ summary: summarizeGovSync([]) });
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
  try {
    const runs = await supabaseRequest<GovSyncRunRow[]>(
      `lead_sync_runs?select=started_at,finished_at,fetched_count,status,metadata&company_id=eq.${encodeURIComponent(scope.companyId)}&source=eq.gov&started_at=gte.${encodeURIComponent(since)}&order=started_at.desc&limit=300`
    );
    return NextResponse.json({ summary: summarizeGovSync(runs) });
  } catch {
    return NextResponse.json({ message: "수집 상태를 불러오지 못했습니다." }, { status: 503 });
  }
}
