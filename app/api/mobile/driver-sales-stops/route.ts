import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { recordPermitLeadAction, supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

type StopRow = { id: string; lead_id: string; stop_order: number; status: string; reason_code: string | null; handed_to_owner: boolean | null; business_permit_leads: { business_name: string; address: string | null } | null };

function scope(request: NextRequest) {
  return getRequestAuthScope(request);
}

export async function GET(request: NextRequest) {
  const auth = await scope(request);
  if (!auth.ok || !auth.companyId || !auth.customerSession?.companyMemberId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("DRIVER_SALES_STOPS", auth.companyId)) return NextResponse.json({ stops: [] });
  const date = request.nextUrl.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const stops = await supabaseRequest<StopRow[]>(`delivery_route_stops?select=id,lead_id,stop_order,status,reason_code,handed_to_owner,business_permit_leads(business_name,address)&company_id=eq.${encodeURIComponent(auth.companyId)}&driver_member_id=eq.${encodeURIComponent(auth.customerSession.companyMemberId)}&route_date=eq.${encodeURIComponent(date)}&stop_type=eq.sales&order=stop_order.asc`);
  return NextResponse.json({ stops: stops.map((stop) => ({ id: stop.id, leadId: stop.lead_id, order: stop.stop_order, status: stop.status, reasonCode: stop.reason_code, handedToOwner: stop.handed_to_owner, name: stop.business_permit_leads?.business_name || "영업 매장", address: stop.business_permit_leads?.address || "" })) });
}

export async function POST(request: NextRequest) {
  const auth = await scope(request);
  if (!auth.ok || !auth.companyId || !auth.customerSession?.companyMemberId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("DRIVER_SALES_STOPS", auth.companyId)) return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { stopId?: string; outcome?: "completed" | "closed" | "moved_or_closed" | "refused" | "no_time"; handedToOwner?: boolean } | null;
  if (!body?.stopId || !/^[0-9a-f-]{36}$/i.test(body.stopId) || !body.outcome) return NextResponse.json({ message: "처리 값을 확인해 주세요." }, { status: 400 });
  const rows = await supabaseRequest<Array<{ id: string; lead_id: string }>>(`delivery_route_stops?select=id,lead_id&id=eq.${encodeURIComponent(body.stopId)}&company_id=eq.${encodeURIComponent(auth.companyId)}&driver_member_id=eq.${encodeURIComponent(auth.customerSession.companyMemberId)}&stop_type=eq.sales&status=in.(planned,arrived)&limit=1`);
  const stop = rows[0];
  if (!stop) return NextResponse.json({ message: "처리할 영업 정류장을 찾지 못했습니다." }, { status: 404 });
  const completed = body.outcome === "completed";
  const now = new Date().toISOString();
  const updated = await supabaseRequest<Array<{ id: string }>>(`delivery_route_stops?id=eq.${encodeURIComponent(stop.id)}&company_id=eq.${encodeURIComponent(auth.companyId)}&status=in.(planned,arrived)`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(completed ? { status: "completed", arrived_at: now, completed_at: now, handed_to_owner: body.handedToOwner === true, reason_code: null, updated_at: now } : { status: "not_delivered", completed_at: now, handed_to_owner: false, reason_code: body.outcome, updated_at: now }) });
  if (!updated.length) return NextResponse.json({ message: "이미 처리된 정류장입니다." }, { status: 409 });
  if (completed) await recordPermitLeadAction(auth.companyId, stop.lead_id, { actionType: "quote", actorName: auth.customerSession.name || "배송기사", collateralTypes: ["단가표"], memo: `단가표 전달 · 기사 · ${now}`, result: "견적 전달" });
  else if (body.outcome === "moved_or_closed" || body.outcome === "refused") await recordPermitLeadAction(auth.companyId, stop.lead_id, { actionType: body.outcome === "moved_or_closed" ? "exclude" : "status", actorName: auth.customerSession.name || "배송기사", memo: body.outcome === "moved_or_closed" ? "폐업" : "기존 거래처 유지", result: body.outcome === "moved_or_closed" ? "제외" : "거절" });
  return NextResponse.json({ ok: true, status: completed ? "견적 발송" : "not_delivered" });
}
