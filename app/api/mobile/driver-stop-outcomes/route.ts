import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = { partial: new Set(["quantity_short", "item_missing", "item_damaged"]), problem: new Set(["damaged", "absent", "return_requested", "access_blocked", "other_problem"]) };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  const auth = await getRequestAuthScope(request);
  const memberId = auth.ok ? auth.customerSession?.companyMemberId : undefined;
  if (!auth.ok || !auth.companyId || !memberId || !auth.customerSession?.duties?.includes("delivery")) return NextResponse.json({ message: "배송 기사 권한이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("DRIVER_RECEIPT_WORKFLOW", auth.companyId)) return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { stopId?: string; outcome?: "partial" | "problem"; reasonCode?: string; detail?: string; attachmentIds?: string[] } | null;
  if (!body?.stopId || !uuid.test(body.stopId) || !body.outcome || !body.reasonCode || !reasons[body.outcome].has(body.reasonCode) || String(body.detail || "").length > 500 || !Array.isArray(body.attachmentIds) || body.attachmentIds.length > 5 || body.attachmentIds.some(id => !uuid.test(id))) return NextResponse.json({ message: "일부·문제 배송 내용을 확인해 주세요." }, { status: 400 });
  const company = encodeURIComponent(auth.companyId), stopId = encodeURIComponent(body.stopId), driver = encodeURIComponent(memberId);
  const rows = await supabaseRequest<Array<{ id: string; customer_id: string; order_id: string | null; status: string; arrived_at: string | null; reason_code: string | null; reason_detail: string | null }>>(
    `delivery_route_stops?select=id,customer_id,order_id,status,arrived_at,reason_code,reason_detail&id=eq.${stopId}&company_id=eq.${company}&driver_member_id=eq.${driver}&stop_type=eq.delivery&limit=1`,
  );
  const stop = rows[0];
  if (!stop) return NextResponse.json({ message: "처리할 배송 정류장을 찾지 못했습니다." }, { status: 404 });
  const detail = body.detail?.trim() || null;
  if (stop.status === body.outcome && (stop.reason_code !== body.reasonCode || (stop.reason_detail || null) !== detail)) return NextResponse.json({ message: "이미 다른 내용으로 처리된 정류장입니다." }, { status: 409 });
  if (!["planned", "arrived", body.outcome].includes(stop.status)) return NextResponse.json({ message: "이미 처리된 정류장입니다." }, { status: 409 });
  const now = new Date().toISOString();
  if (stop.status !== body.outcome) {
    const updated = await supabaseRequest<Array<{ id: string }>>(`delivery_route_stops?id=eq.${stopId}&company_id=eq.${company}&driver_member_id=eq.${driver}&status=in.(planned,arrived)`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: body.outcome, reason_code: body.reasonCode, reason_detail: detail, arrived_at: stop.arrived_at || now, completed_at: now, updated_at: now }),
    });
    if (!updated.length) return NextResponse.json({ message: "이미 처리된 정류장입니다." }, { status: 409 });
  }
  if (body.attachmentIds.length) {
    const attachmentIds = body.attachmentIds.map(encodeURIComponent);
    const attachments = await supabaseRequest<Array<{ id: string; mime_type: string | null; storage_path: string | null }>>(
      `customer_attachments?select=id,mime_type,storage_path&company_id=eq.${company}&customer_id=eq.${encodeURIComponent(stop.customer_id)}&id=in.(${attachmentIds.join(",")})`,
    );
    if (attachments.length !== body.attachmentIds.length) return NextResponse.json({ message: "정류장에 연결할 배송 사진을 확인해 주세요." }, { status: 400 });
    const photos = attachments.filter((item): item is { id: string; mime_type: "image/jpeg" | "image/png" | "image/webp"; storage_path: string } =>
      Boolean(item.storage_path) && ["image/jpeg", "image/png", "image/webp"].includes(item.mime_type || ""));
    const existing = await supabaseRequest<Array<{ storage_path: string; sort_order: number }>>(
      `delivery_route_stop_photos?select=storage_path,sort_order&company_id=eq.${company}&stop_id=eq.${stopId}&order=sort_order.asc`,
    );
    const existingPaths = new Set(existing.map(item => item.storage_path));
    let sortOrder = existing.reduce((maximum, item) => Math.max(maximum, item.sort_order), 0);
    const newPhotos = photos.filter(item => !existingPaths.has(item.storage_path)).slice(0, Math.max(0, 5 - existing.length)).map(item => ({
      company_id: auth.companyId, stop_id: stop.id, order_id: stop.order_id, storage_path: item.storage_path, mime_type: item.mime_type, sort_order: ++sortOrder, captured_at: now,
    }));
    if (newPhotos.length) await supabaseRequest("delivery_route_stop_photos", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(newPhotos) });
  }
  await supabaseRequest("company_notifications?on_conflict=company_id,idempotency_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({
    company_id: auth.companyId, notification_type: body.outcome === "partial" ? "delivery_partial" : "delivery_problem", customer_id: stop.customer_id, order_id: stop.order_id,
    before_values: { stop_status: stop.status }, after_values: { stop_id: stop.id, status: body.outcome, reason_code: body.reasonCode, detail, attachment_ids: body.attachmentIds }, idempotency_key: `driver-stop:${stop.id}:${body.outcome}`,
  }) });
  return NextResponse.json({ ok: true, status: body.outcome });
}
