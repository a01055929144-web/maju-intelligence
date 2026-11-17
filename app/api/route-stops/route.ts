import { NextRequest, NextResponse } from "next/server";
import type { RouteStopRecord } from "@/domains/delivery/stop-timeline";
import { getRequestAuthScope } from "@/lib/auth";
import { isProductionStoreConfigured, supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const q = encodeURIComponent;

type Row = {
  id: string; stop_order: number; stop_type: "delivery" | "sales"; status: RouteStopRecord["status"]; driver_name_snapshot: string;
  arrived_at: string | null; completed_at: string | null; reason_code: string | null; customer_id: string | null; lead_id: string | null;
};

// CC-67: 하루의 배송 정류장(순서 · 종류 · 상태 · 도착/완료 시각 · 사진 수 · 전달 못 함 이유). 읽기 전용 · 회사 범위. 없으면 빈 목록 → 화면은 지금 방식 그대로.
// shortcut: 이름은 거래처/리드 한 번에 조회(정류장 하루 최대 500), 담당 거래처 범위 제한은 이 화면(지도 소유자용)에서 하지 않는다 — 기사 범위 제한이 필요하면 assignmentKeys로 거른다.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ message: "날짜를 확인해 주세요." }, { status: 400 });
  if (!isProductionStoreConfigured()) return NextResponse.json({ stops: [] });
  try {
    const company = q(scope.companyId);
    const rows = await supabaseRequest<Row[]>(`delivery_route_stops?select=id,stop_order,stop_type,status,driver_name_snapshot,arrived_at,completed_at,reason_code,customer_id,lead_id&company_id=eq.${company}&route_date=eq.${q(date)}&order=stop_order.asc&limit=500`);
    if (!rows.length) return NextResponse.json({ stops: [] });
    const ids = (key: "customer_id" | "lead_id") => Array.from(new Set(rows.map((r) => r[key]).filter((v): v is string => Boolean(v))));
    const [customers, leads, photos, reasons] = await Promise.all([
      ids("customer_id").length ? supabaseRequest<Array<{ id: string; customer_name: string }>>(`normalized_customers?select=id,customer_name&company_id=eq.${company}&id=in.(${ids("customer_id").join(",")})`) : [],
      ids("lead_id").length ? supabaseRequest<Array<{ id: string; business_name: string }>>(`business_permit_leads?select=id,business_name&company_id=eq.${company}&id=in.(${ids("lead_id").join(",")})`) : [],
      supabaseRequest<Array<{ stop_id: string }>>(`delivery_route_stop_photos?select=stop_id&company_id=eq.${company}&stop_id=in.(${rows.map((r) => r.id).join(",")})&limit=2500`).catch(() => []),
      supabaseRequest<Array<{ code: string; label: string }>>(`delivery_route_reason_codes?select=code,label`).catch(() => [])
    ]);
    const name = new Map<string, string>([...customers.map((c) => [c.id, c.customer_name] as const), ...leads.map((l) => [l.id, l.business_name] as const)]);
    const reason = new Map(reasons.map((r) => [r.code, r.label]));
    const photoCount = new Map<string, number>();
    for (const p of photos) photoCount.set(p.stop_id, (photoCount.get(p.stop_id) ?? 0) + 1);
    const stops: RouteStopRecord[] = rows.map((r) => ({
      id: r.id, order: r.stop_order, type: r.stop_type, status: r.status, name: name.get(r.customer_id ?? r.lead_id ?? "") ?? "이름 없음", driverName: r.driver_name_snapshot,
      arrivedAt: r.arrived_at, completedAt: r.completed_at, reasonLabel: r.reason_code ? reason.get(r.reason_code) ?? r.reason_code : null, photoCount: photoCount.get(r.id) ?? 0
    }));
    return NextResponse.json({ stops });
  } catch {
    return NextResponse.json({ message: "정류장을 불러오지 못했습니다." }, { status: 503 });
  }
}
