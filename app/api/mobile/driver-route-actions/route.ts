import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { supabaseRequest } from "@/lib/store";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

async function scope(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return null;
  const auth = await getRequestAuthScope(request);
  const memberId = auth.ok ? auth.customerSession?.companyMemberId : undefined;
  if (!auth.ok || !auth.companyId || !memberId || !auth.customerSession?.duties?.includes("delivery") || !isFeatureEnabled("DRIVER_RUN_EXPERIENCE", auth.companyId)) return null;
  return { companyId: auth.companyId, memberId };
}

export async function POST(request: NextRequest) {
  const verified = await scope(request);
  if (!verified) return NextResponse.json({ message: "기능이 열리지 않았거나 기사 권한이 없습니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { customerIds?: string[] } | null;
  const customerIds = body?.customerIds;
  if (!Array.isArray(customerIds) || !customerIds.length || new Set(customerIds).size !== customerIds.length || customerIds.some((id) => !uuid.test(id))) return NextResponse.json({ message: "배송지 순서를 확인해 주세요." }, { status: 400 });
  const company = encodeURIComponent(verified.companyId), driver = encodeURIComponent(verified.memberId), date = today();
  const rows = await supabaseRequest<Array<{ customer_id: string; id: string; status: string; stop_order: number; stop_type: string }>>(
    `delivery_route_stops?select=id,customer_id,status,stop_order,stop_type&company_id=eq.${company}&driver_member_id=eq.${driver}&route_date=eq.${date}&order=stop_order.asc`,
  );
  const delivery = rows.filter((row) => row.stop_type === "delivery");
  if (rows.some((row) => row.status !== "planned") || delivery.length !== customerIds.length) return NextResponse.json({ message: "운행 시작 전 대기 배송지만 순서를 바꿀 수 있습니다." }, { status: 409 });
  const byCustomer = new Map(delivery.map((row) => [row.customer_id, row]));
  const ordered = customerIds.map((id) => byCustomer.get(id));
  if (ordered.some((row) => !row)) return NextResponse.json({ message: "경로가 바뀌었습니다. 새로고침해 주세요." }, { status: 409 });
  await supabaseRequest("rpc/reorder_driver_delivery_stops", { method: "POST", body: JSON.stringify({
    p_company_id: verified.companyId, p_driver_member_id: verified.memberId, p_route_date: date,
    p_stop_ids: ordered.map((row) => row!.id), p_stop_orders: delivery.map((row) => row.stop_order),
  }) });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const verified = await scope(request);
  if (!verified) return NextResponse.json({ message: "기능이 열리지 않았거나 기사 권한이 없습니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { customerIds?: string[] } | null;
  const customerIds = body?.customerIds;
  if (!Array.isArray(customerIds) || !customerIds.length || new Set(customerIds).size !== customerIds.length || customerIds.some((id) => !uuid.test(id))) return NextResponse.json({ message: "완료할 배송지를 확인해 주세요." }, { status: 400 });

  const company = encodeURIComponent(verified.companyId), driver = encodeURIComponent(verified.memberId), date = today();
  const rows = await supabaseRequest<Array<{ customer_id: string; id: string; status: string; stop_type: string }>>(
    `delivery_route_stops?select=id,customer_id,status,stop_type&company_id=eq.${company}&driver_member_id=eq.${driver}&route_date=eq.${date}&customer_id=in.(${customerIds.map(encodeURIComponent).join(",")})`,
  );
  if (rows.length !== customerIds.length) return NextResponse.json({ message: "같은 거래처가 경로에 여러 번 있거나 경로가 바뀌었습니다. 개별 처리해 주세요." }, { status: 409 });
  const byCustomer = new Map(rows.map((row) => [row.customer_id, row]));
  const selected = customerIds.map((id) => byCustomer.get(id));
  if (selected.some((row) => !row) || selected.some((row) => row?.stop_type !== "delivery" || !["planned", "arrived"].includes(row.status))) {
    return NextResponse.json({ message: "경로가 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요." }, { status: 409 });
  }

  const completedAt = new Date().toISOString();
  const stopIds = selected.map((row) => row!.id);
  const updated = await supabaseRequest<Array<{ id: string }>>(
    `delivery_route_stops?company_id=eq.${company}&driver_member_id=eq.${driver}&route_date=eq.${date}&id=in.(${stopIds.map(encodeURIComponent).join(",")})&status=in.(planned,arrived)`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ completed_at: completedAt, status: "completed", updated_at: completedAt }) },
  );
  if (updated.length !== stopIds.length) return NextResponse.json({ message: "일부 정류장 상태가 바뀌었습니다. 새로고침해 확인해 주세요." }, { status: 409 });
  return NextResponse.json({ completedAt, customerIds, ok: true, stopIds });
}

export async function DELETE(request: NextRequest) {
  const verified = await scope(request);
  if (!verified) return NextResponse.json({ message: "기능이 열리지 않았거나 기사 권한이 없습니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { completedAt?: string; stopId?: string; stopIds?: string[] } | null;
  const stopIds = body?.stopIds || (body?.stopId ? [body.stopId] : []);
  if (!stopIds.length || new Set(stopIds).size !== stopIds.length || stopIds.some((id) => !uuid.test(id)) || !body?.completedAt || Number.isNaN(Date.parse(body.completedAt))) return NextResponse.json({ message: "되돌릴 기록을 확인해 주세요." }, { status: 400 });
  const results = await Promise.allSettled(stopIds.map((stopId) => supabaseRequest("rpc/undo_driver_route_stop", { method: "POST", body: JSON.stringify({ p_company_id: verified.companyId, p_driver_member_id: verified.memberId, p_stop_id: stopId, p_completed_at: body.completedAt }) })));
  const undoneStopIds = stopIds.filter((_, index) => results[index].status === "fulfilled");
  const failedStopIds = stopIds.filter((_, index) => results[index].status === "rejected");
  if (failedStopIds.length) return NextResponse.json({ failedStopIds, message: undoneStopIds.length ? "일부 정류장만 되돌렸습니다. 남은 완료 기록을 확인해 주세요." : "5초가 지났거나 기록이 이미 바뀌었습니다.", undoneStopIds }, { status: 409 });
  return NextResponse.json({ ok: true, undoneStopIds });
}
