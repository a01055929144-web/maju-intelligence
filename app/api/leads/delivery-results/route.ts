import { NextRequest, NextResponse } from "next/server";
import { mergeDeliveryResults } from "@/domains/lead/delivery-result";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { isProductionStoreConfigured, supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const q = encodeURIComponent;

// CC-65: 가는 길 영업 결과 — 기사가 단가표를 전달한 리드(완료된 영업 정류장)와 받은 쪽이 열어본 리드(CX-44 열람 기록). 읽기 전용 · 회사 범위 ·
// ROUTE_SALES_STOPS 스위치 뒤(꺼져 있으면 빈 목록). shortcut: 각각 최근 500건까지만(그보다 오래된 리드는 표시 안 됨), 더 필요하면 리드 ID로 조회.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  if (!isFeatureEnabled("ROUTE_SALES_STOPS", scope.companyId) || !isProductionStoreConfigured()) return NextResponse.json({ items: [] });
  try {
    const company = q(scope.companyId);
    const [stops, links] = await Promise.all([
      supabaseRequest<Array<{ lead_id: string; completed_at: string }>>(`delivery_route_stops?select=lead_id,completed_at&company_id=eq.${company}&stop_type=eq.sales&status=eq.completed&lead_id=not.is.null&completed_at=not.is.null&order=completed_at.desc&limit=500`),
      supabaseRequest<Array<{ lead_id: string; first_viewed_at: string }>>(`pricing_document_share_links?select=lead_id,first_viewed_at&company_id=eq.${company}&lead_id=not.is.null&first_viewed_at=not.is.null&order=first_viewed_at.desc&limit=500`)
    ]);
    return NextResponse.json({ items: mergeDeliveryResults(stops.map((s) => ({ leadId: s.lead_id, at: s.completed_at })), links.map((l) => ({ leadId: l.lead_id, at: l.first_viewed_at }))) });
  } catch {
    return NextResponse.json({ message: "영업 결과를 불러오지 못했습니다." }, { status: 503 });
  }
}
