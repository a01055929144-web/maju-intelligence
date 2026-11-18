import { NextRequest, NextResponse } from "next/server";
import { isVisitPhotoStoragePath, normalizeVisitMaterials, revisitAt, visitRevisitCandidates } from "@/domains/lead/visit-materials";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const q = encodeURIComponent;

type VisitRow = { created_at: string; lead_id: string; collateral_types: string[]; memo: string | null; metadata: { visitPhotoStoragePath?: string } | null };

async function guard(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId || !scope.customerSession?.companyMemberId || !scope.customerSession.duties?.includes("delivery")) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!isFeatureEnabled("LEAD_VISIT_MATERIALS", scope.companyId)) return { error: NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404 }) };
  return { companyId: scope.companyId, memberId: scope.customerSession.companyMemberId, actorName: scope.customerSession.name || "배송기사" };
}

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if ("error" in auth) return auth.error;
  try {
    const company = q(auth.companyId);
    const assigned = await supabaseRequest<Array<{ lead_id: string }>>(`delivery_route_stops?select=lead_id&company_id=eq.${company}&driver_member_id=eq.${q(auth.memberId)}&stop_type=eq.sales&lead_id=not.is.null&limit=500`);
    const leadIds = Array.from(new Set(assigned.map((stop) => stop.lead_id)));
    if (!leadIds.length) return NextResponse.json({ items: [] });
    const ids = leadIds.map(q).join(",");
    const visits = await supabaseRequest<VisitRow[]>(`lead_actions?select=lead_id,collateral_types,memo,metadata,created_at&company_id=eq.${company}&lead_id=in.(${ids})&action_type=eq.visit&result=eq.${q("방문 자료 전달")}&voided_at=is.null&order=created_at.desc&limit=500`);
    const [opens, accepts] = await Promise.all([
      supabaseRequest<Array<{ lead_id: string; first_viewed_at: string }>>(`pricing_document_share_links?select=lead_id,first_viewed_at&company_id=eq.${company}&lead_id=in.(${ids})&first_viewed_at=not.is.null&order=first_viewed_at.desc&limit=500`),
      supabaseRequest<Array<{ lead_id: string; customer_id: string; created_at: string }>>(`pricing_document_acceptance_requests?select=lead_id,customer_id,created_at&company_id=eq.${company}&lead_id=in.(${ids})&customer_id=not.is.null&order=created_at.desc&limit=500`)
    ]);
    const customerIds = Array.from(new Set(accepts.map((item) => item.customer_id)));
    const orders = customerIds.length ? await supabaseRequest<Array<{ customer_id: string; submitted_at: string }>>(`store_orders?select=customer_id,submitted_at&company_id=eq.${company}&customer_id=in.(${customerIds.map(q).join(",")})&status=neq.cancelled&order=submitted_at.desc&limit=500`) : [];
    const leadByCustomer = new Map(accepts.map((item) => [item.customer_id, item.lead_id]));
    const reactions = leadIds.map((leadId) => ({
      leadId,
      openedAt: opens.find((item) => item.lead_id === leadId)?.first_viewed_at,
      orderedAt: orders.find((item) => leadByCustomer.get(item.customer_id) === leadId)?.submitted_at
    }));
    return NextResponse.json({ items: visitRevisitCandidates(visits.map((visit) => ({ at: visit.created_at, leadId: visit.lead_id, materials: visit.collateral_types, memo: visit.memo, photoStoragePath: visit.metadata?.visitPhotoStoragePath })), reactions) });
  } catch {
    return NextResponse.json({ message: "재방문 후보를 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as { materials?: string[]; memo?: string; photoStoragePath?: string; stopId?: string } | null;
  const materials = normalizeVisitMaterials(body?.materials ?? []);
  if (!body || !/^[0-9a-f-]{36}$/i.test(body.stopId ?? "") || !materials.length || materials.length !== new Set(body.materials ?? []).size || (body.memo?.length ?? 0) > 1000 || !isVisitPhotoStoragePath(auth.companyId, body.photoStoragePath)) {
    return NextResponse.json({ message: "방문 기록 값을 확인해 주세요." }, { status: 400 });
  }
  try {
    const company = q(auth.companyId), stopId = q(body.stopId!);
    const [stop] = await supabaseRequest<Array<{ id: string; lead_id: string }>>(`delivery_route_stops?select=id,lead_id&id=eq.${stopId}&company_id=eq.${company}&driver_member_id=eq.${q(auth.memberId)}&stop_type=eq.sales&limit=1`);
    if (!stop?.lead_id) return NextResponse.json({ message: "기록할 영업 정류장을 찾지 못했습니다." }, { status: 404 });
    const existing = await supabaseRequest<Array<{ id: string; follow_up_at: string }>>(`lead_actions?select=id,follow_up_at&company_id=eq.${company}&lead_id=eq.${q(stop.lead_id)}&action_type=eq.visit&metadata->>visitStopId=eq.${stopId}&limit=1`);
    if (existing[0]) return NextResponse.json({ actionId: existing[0].id, followUpAt: existing[0].follow_up_at, ok: true });
    const now = new Date().toISOString(), followUpAt = revisitAt(now);
    const [action] = await supabaseRequest<Array<{ id: string }>>("lead_actions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: auth.companyId, lead_id: stop.lead_id, action_type: "visit", result: "방문 자료 전달", memo: body.memo?.trim() || null, actor_name: auth.actorName, collateral_types: materials, follow_up_at: followUpAt, metadata: { source: "driver-route-sales", visitStopId: stop.id, visitPhotoStoragePath: body.photoStoragePath || null } }) });
    if (!action) throw new Error("visit_action_not_returned");
    return NextResponse.json({ actionId: action.id, followUpAt, ok: true });
  } catch {
    return NextResponse.json({ message: "방문 기록을 저장하지 못했습니다." }, { status: 503 });
  }
}
