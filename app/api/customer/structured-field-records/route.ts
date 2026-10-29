import { NextResponse } from "next/server";
import { getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { areStructuredFieldRecordsEnabled } from "@/lib/feature-modules";
import { supabaseRequest } from "@/lib/store";

type StructuredRecordRequest =
  | { kind: "delivery"; customerId: string; memo: string; idempotencyKey: string; event: Record<string, unknown>; items?: unknown[] }
  | { kind: "lead_sales_offer"; leadId: string; memo: string; idempotencyKey: string; action: Record<string, unknown>; items: unknown[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!areStructuredFieldRecordsEnabled(session.companyId)) {
    return NextResponse.json({ message: "구조화 현장 기록 기능은 아직 활성화되지 않았습니다." }, { status: 404 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const subjectId = url.searchParams.get(kind === "delivery" ? "customerId" : "leadId") || "";
  if (!subjectId) return NextResponse.json({ message: "조회 대상을 확인해 주세요." }, { status: 400 });
  const companyId = encodeURIComponent(session.companyId);
  const encodedSubjectId = encodeURIComponent(subjectId);

  if (kind === "delivery") {
    const events = await supabaseRequest<Array<Record<string, unknown>>>(
      `delivery_events?select=id,event_type,cause_code,occurrence_stage,action_code,action_amount,status,memo,occurred_at&company_id=eq.${companyId}&customer_id=eq.${encodedSubjectId}&order=occurred_at.desc&limit=1`
    );
    const event = events[0];
    if (!event?.id) return NextResponse.json({ record: null });
    const items = await supabaseRequest<Array<Record<string, unknown>>>(
      `delivery_event_items?select=id,line_number,item_name,quantity,quantity_unit,supplier_name&company_id=eq.${companyId}&delivery_event_id=eq.${encodeURIComponent(String(event.id))}&order=line_number.asc`
    );
    return NextResponse.json({ record: { ...event, items } });
  }

  if (kind === "lead_sales_offer") {
    const offers = await supabaseRequest<Array<Record<string, unknown>>>(
      `sales_offers?select=id,memo,offered_at&company_id=eq.${companyId}&lead_id=eq.${encodedSubjectId}&order=offered_at.desc&limit=1`
    );
    const offer = offers[0];
    if (!offer?.id) return NextResponse.json({ record: null });
    const items = await supabaseRequest<Array<Record<string, unknown>>>(
      `sales_offer_items?select=id,line_number,item_name,offered_price,currency_code,valid_until,sample_provided,sample_quantity,sample_unit&company_id=eq.${companyId}&sales_offer_id=eq.${encodeURIComponent(String(offer.id))}&order=line_number.asc`
    );
    return NextResponse.json({ record: { ...offer, items } });
  }

  return NextResponse.json({ message: "지원하지 않는 기록 유형입니다." }, { status: 400 });
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // 중요: 플래그가 꺼진 회사는 body 파싱과 DB 호출 전에 종료한다.
  // RPC가 운영 승인·적용되기 전 기본값은 항상 OFF다.
  if (!areStructuredFieldRecordsEnabled(session.companyId)) {
    return NextResponse.json({ message: "구조화 현장 기록 기능은 아직 활성화되지 않았습니다." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as StructuredRecordRequest | null;
  if (!body || !isObject(body)) return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const actorName = getCustomerOperationalName(session);
  if (body.kind === "delivery") {
    if (!body.customerId || !body.memo?.trim() || !body.idempotencyKey || !isObject(body.event) || !Array.isArray(body.items || [])) {
      return NextResponse.json({ message: "배송 기록 필수값을 확인해 주세요." }, { status: 400 });
    }
    const result = await supabaseRequest<{ eventId: string; noteId: string }>("rpc/record_delivery_event_atomic", {
      method: "POST",
      body: JSON.stringify({
        p_actor_name: actorName,
        p_actor_user_id: session.userId || null,
        p_company_id: session.companyId,
        p_customer_id: body.customerId,
        p_event: body.event,
        p_idempotency_key: body.idempotencyKey,
        p_items: body.items || [],
        p_memo: body.memo.trim()
      })
    });
    return NextResponse.json({ record: result });
  }

  if (body.kind === "lead_sales_offer") {
    if (!body.leadId || !body.memo?.trim() || !body.idempotencyKey || !isObject(body.action) || !Array.isArray(body.items) || !body.items.length) {
      return NextResponse.json({ message: "영업 제안 필수값을 확인해 주세요." }, { status: 400 });
    }
    const result = await supabaseRequest<{ actionId: string; offerId: string }>("rpc/record_lead_sales_offer_atomic", {
      method: "POST",
      body: JSON.stringify({
        p_action: body.action,
        p_actor_name: actorName,
        p_actor_user_id: session.userId || null,
        p_company_id: session.companyId,
        p_items: body.items,
        p_idempotency_key: body.idempotencyKey,
        p_lead_id: body.leadId,
        p_memo: body.memo.trim()
      })
    });
    return NextResponse.json({ record: result });
  }

  return NextResponse.json({ message: "지원하지 않는 기록 유형입니다." }, { status: 400 });
}
