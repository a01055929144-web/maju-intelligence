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
