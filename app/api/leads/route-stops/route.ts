import { NextRequest, NextResponse } from "next/server";
import { suggestInsertion } from "@/domains/lead/route-insert";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

// CC-59: 영업 담당이 리드를 오늘·내일 배송 경로에 "가는 길에 넣기". ROUTE_SALES_STOPS 스위치(기본 OFF)·회사 허용 목록 뒤에서만 열린다.
const UUID = /^[0-9a-f-]{36}$/i;
type StopRow = { id: string; driver_member_id: string | null; driver_name_snapshot: string; stop_order: number; stop_type: string; customer_id: string | null; lead_id: string | null };
type Point = { latitude: number | null; longitude: number | null };

const q = encodeURIComponent;
const kstDay = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + offset * 86_400_000));
const dayOf = (value: string | null) => (value === "tomorrow" ? kstDay(1) : value === "today" ? kstDay(0) : null);
const has = (p: Point | undefined): p is { latitude: number; longitude: number } => typeof p?.latitude === "number" && typeof p?.longitude === "number";

async function guard(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!scopeHasCapability(scope, "manage_sales")) return { error: NextResponse.json({ message: "권한이 없습니다." }, { status: 403 }) };
  return { companyId: scope.companyId, enabled: isFeatureEnabled("ROUTE_SALES_STOPS", scope.companyId) };
}

/** 그 날짜의 기사별 경로와 이 리드의 추천 자리. 영업 칸이 이미 있으면 alreadyAdded. */
async function plan(companyId: string, leadId: string, date: string) {
  const [lead] = await supabaseRequest<Point[]>(`business_permit_leads?select=latitude,longitude&company_id=eq.${q(companyId)}&id=eq.${q(leadId)}&limit=1`);
  const stops = await supabaseRequest<StopRow[]>(`delivery_route_stops?select=id,driver_member_id,driver_name_snapshot,stop_order,stop_type,customer_id,lead_id&company_id=eq.${q(companyId)}&route_date=eq.${q(date)}&status=in.(planned,arrived)&order=stop_order.asc&limit=500`);
  const customerIds = Array.from(new Set(stops.map((s) => s.customer_id).filter((id): id is string => Boolean(id))));
  const customers = customerIds.length ? await supabaseRequest<Array<Point & { id: string }>>(`normalized_customers?select=id,latitude,longitude&company_id=eq.${q(companyId)}&id=in.(${customerIds.join(",")})`) : [];
  const pointById = new Map(customers.map((c) => [c.id, c]));
  const byDriver = new Map<string, StopRow[]>();
  for (const stop of stops) if (stop.driver_member_id) byDriver.set(stop.driver_member_id, [...(byDriver.get(stop.driver_member_id) ?? []), stop]);
  const drivers = Array.from(byDriver, ([driverMemberId, rows]) => {
    const located = rows.flatMap((r) => { const p = r.customer_id ? pointById.get(r.customer_id) : undefined; return has(p) ? [{ order: r.stop_order, lat: p.latitude, lng: p.longitude }] : []; });
    return { driverMemberId, name: rows[0].driver_name_snapshot, stopCount: rows.length, alreadyAdded: rows.some((r) => r.lead_id === leadId), suggestion: has(lead) ? suggestInsertion(located, { lat: lead.latitude, lng: lead.longitude }) : null, rows };
  });
  return { drivers, hasLeadPoint: has(lead) };
}

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if ("error" in auth) return auth.error;
  if (!auth.enabled) return NextResponse.json({ enabled: false, drivers: [] });
  const leadId = request.nextUrl.searchParams.get("leadId") ?? "", date = dayOf(request.nextUrl.searchParams.get("date"));
  if (!UUID.test(leadId) || !date) return NextResponse.json({ message: "값을 확인해 주세요." }, { status: 400 });
  try {
    const { drivers, hasLeadPoint } = await plan(auth.companyId, leadId, date);
    return NextResponse.json({ enabled: true, hasLeadPoint, drivers: drivers.map((driver) => ({ driverMemberId: driver.driverMemberId, name: driver.name, stopCount: driver.stopCount, alreadyAdded: driver.alreadyAdded, suggestion: driver.suggestion })) });
  } catch { return NextResponse.json({ message: "배송 경로를 불러오지 못했습니다." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if ("error" in auth) return auth.error;
  if (!auth.enabled) return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { leadId?: string; date?: string; driverMemberId?: string } | null;
  const date = dayOf(body?.date ?? null);
  if (!body || !UUID.test(body.leadId ?? "") || !UUID.test(body.driverMemberId ?? "") || !date) return NextResponse.json({ message: "값을 확인해 주세요." }, { status: 400 });
  try {
    const { drivers } = await plan(auth.companyId, body.leadId as string, date);
    const driver = drivers.find((d) => d.driverMemberId === body.driverMemberId);
    if (!driver) return NextResponse.json({ message: "그 날짜 경로를 찾지 못했습니다." }, { status: 404 });
    if (driver.alreadyAdded) return NextResponse.json({ message: "이미 이 경로에 들어 있습니다." }, { status: 409 });
    if (!driver.suggestion) return NextResponse.json({ message: "리드나 경로 정류장의 위치를 몰라 자리를 정하지 못했습니다." }, { status: 422 });
    const at = driver.suggestion.insertAt;
    // shortcut: 뒤 정류장을 한 칸씩 미루는 요청이 여러 번이라 중간에 끊기면 번호에 빈 칸이 남는다(순서는 유지). 한 번에 미루는 DB 함수가 생기면 교체.
    for (const row of driver.rows.filter((r) => r.stop_order >= at).sort((a, b) => b.stop_order - a.stop_order)) {
      await supabaseRequest(`delivery_route_stops?id=eq.${q(row.id)}&company_id=eq.${q(auth.companyId)}`, { method: "PATCH", body: JSON.stringify({ stop_order: row.stop_order + 1, updated_at: new Date().toISOString() }) });
    }
    await supabaseRequest("delivery_route_stops", { method: "POST", body: JSON.stringify({ company_id: auth.companyId, route_date: date, driver_member_id: driver.driverMemberId, driver_name_snapshot: driver.name, stop_order: at, stop_type: "sales", lead_id: body.leadId, source: "manual" }) });
    return NextResponse.json({ ok: true, insertAt: at, extraMinutes: driver.suggestion.extraMinutes });
  } catch { return NextResponse.json({ message: "경로에 넣지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 503 }); }
}
