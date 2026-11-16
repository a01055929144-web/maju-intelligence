import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { supabaseRequest } from "@/lib/store";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => null) as { companyId?: string; storeAccountId?: string; orderId?: string; documentId?: string; revision?: number; status?: "confirmed" | "disputed"; memo?: string } | null;
  if (!body || ![body.companyId, body.storeAccountId, body.orderId, body.documentId].every(value => uuid.test(String(value || ""))) ||
      !Number.isInteger(body.revision) || (body.status !== "confirmed" && body.status !== "disputed") ||
      (body.status === "disputed" && !body.memo?.trim()) || String(body.memo || "").length > 500) {
    return NextResponse.json({ message: "수령 확인 내용을 확인해 주세요." }, { status: 400 });
  }
  if (!isFeatureEnabled("ERP_ORDER_DOCUMENTS", body.companyId)) return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404 });
  const member = await getStoreMemberContext({ companyId: body.companyId!, storeAccountId: body.storeAccountId! });
  if (!member) return NextResponse.json({ message: "매장 구성원 로그인이 필요합니다." }, { status: 401 });
  const company = encodeURIComponent(member.companyId), account = encodeURIComponent(member.storeAccountId);
  const stores = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?select=customer_id&company_id=eq.${company}&id=eq.${account}&status=eq.active&business_status=in.(active,registration_pending)&limit=1`,
  );
  const customerId = stores[0]?.customer_id;
  if (!customerId) return NextResponse.json({ message: "매장을 찾지 못했습니다." }, { status: 404 });
  const orders = await supabaseRequest<Array<{ id: string }>>(
    `store_orders?select=id&id=eq.${encodeURIComponent(body.orderId!)}&company_id=eq.${company}&customer_id=eq.${encodeURIComponent(customerId)}` +
    `&status=eq.delivered&or=(store_account_id.eq.${account},store_account_id.is.null)&limit=1`,
  );
  const documents = orders.length ? await supabaseRequest<Array<{ id: string }>>(
    `business_documents?select=id&id=eq.${encodeURIComponent(body.documentId!)}&company_id=eq.${company}&customer_id=eq.${encodeURIComponent(customerId)}` +
    `&document_type=eq.sale&status=eq.confirmed&source_type=eq.order&source_key=eq.${encodeURIComponent(`order:${body.orderId}`)}&revision=eq.${body.revision}&limit=1`,
  ) : [];
  if (!documents.length) return NextResponse.json({ message: "현재 전표를 찾지 못했습니다. 주문 내역을 새로고침해 주세요." }, { status: 409 });
  try {
    const receipt = await supabaseRequest("rpc/record_business_document_receipt", { method: "POST", body: JSON.stringify({
      p_company_id: member.companyId, p_document_id: body.documentId, p_revision: body.revision, p_status: body.status,
      p_store_account_id: member.storeAccountId, p_store_member_id: member.memberId, p_memo: body.memo?.trim() || null,
      p_photo_attachment_id: null,
    }) });
    return NextResponse.json({ receipt }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ message: /document_revision_conflict/.test(message) ? "전표가 수정되었습니다. 새로고침 후 다시 확인해 주세요." :
      /receipt_already_recorded/.test(message) ? "이미 다른 내용으로 수령 확인이 기록됐습니다." : "수령 확인을 저장하지 못했습니다." },
    { status: /conflict|already/.test(message) ? 409 : 500 });
  }
}
