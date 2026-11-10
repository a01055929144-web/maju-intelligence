import { NextRequest,NextResponse } from "next/server";
import { getRequestAuthScope } from "../../../lib/auth";
import { canManagePriceSheets } from "../../../domains/pricing/access";
import { isId } from "../../../domains/pricing/document";
import { parseDeliveryConfirmation } from "../../../domains/order/confirm-delivery-date";
import { confirmPendingOrder,listPendingOrders,pendingOrderInboxEnabled } from "../../../lib/pricing/pending-order-inbox";
import { priceSheetsEnabled } from "../../../lib/pricing/feature";
import { storeOrderingEnabled } from "../../../lib/pricing/store-order-feature";

export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:NextRequest) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled() || process.env.STORE_ORDER_DELIVERY_CONFIRMATION_ENABLED!=="true") return reply({message:"사용할 수 없는 기능입니다."},404);
  const auth=await getRequestAuthScope(request,request.nextUrl.searchParams.get("companyId")||undefined);
  if (!auth.ok) return reply({message:"회사 계정으로 로그인해 주세요."},401);
  if (!auth.companyId || !pendingOrderInboxEnabled(auth.companyId)) return reply({message:"사용할 수 없는 기능입니다."},404);
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return reply({message:"주문을 확인할 권한이 없습니다."},403);
  const page=Number(request.nextUrl.searchParams.get("page")||1);
  if (!Number.isSafeInteger(page)||page<1||page>1000) return reply({message:"조회 페이지를 확인해 주세요."},400);
  try {return reply({...await listPendingOrders(auth.companyId,page),canConfirm:Boolean(auth.customerSession && isId(auth.customerSession.companyMemberId) && isId(auth.customerSession.userId))});}
  catch {return reply({message:"대기 주문을 불러오지 못했습니다. 다시 조회해 주세요."},503);}
}
export async function POST(request:NextRequest) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled() || process.env.STORE_ORDER_DELIVERY_CONFIRMATION_ENABLED!=="true") return reply({message:"사용할 수 없는 기능입니다."},404);
  if (request.headers.get("origin")!==request.nextUrl.origin) return reply({message:"같은 회사 화면에서 다시 시도해 주세요."},403);
  const auth=await getRequestAuthScope(request);
  if (!auth.ok) return reply({message:"회사 계정으로 로그인해 주세요."},401);
  if (!auth.companyId || !pendingOrderInboxEnabled(auth.companyId)) return reply({message:"사용할 수 없는 기능입니다."},404);
  const session=auth.customerSession;
  if (!session || !canManagePriceSheets(session) || !isId(session.companyMemberId) || !isId(session.userId))
    return reply({message:"회사의 대표·관리자 계정으로 다시 로그인해 주세요. 관리자 미리보기에서는 확정할 수 없습니다."},403);
  let command:ReturnType<typeof parseDeliveryConfirmation>;
  try { const body:unknown=await request.json().catch(()=>null);
    if (!body || typeof body!=="object" || Array.isArray(body)) throw new Error("주문 정보를 확인해 주세요.");
    command=parseDeliveryConfirmation(body as Record<string,unknown>);
  } catch(cause) {return reply({message:cause instanceof Error?cause.message:"배송일을 확인해 주세요."},400);}
  try {return reply({result:await confirmPendingOrder({...command,companyId:auth.companyId,memberId:session.companyMemberId,userId:session.userId})});}
  catch(cause) {
    const reason=cause instanceof Error?cause.message:"";
    if(/pending_confirmation_manager_required/.test(reason))return reply({message:"처리 권한이 변경되었습니다. 회사 대표·관리자로 다시 로그인해 주세요."},403);
    if(/pending_confirmation_date_invalid/.test(reason))return reply({message:"오늘부터 366일 이내의 배송일을 선택해 주세요."},400);
    if(/pending_confirmation_date_unavailable/.test(reason))return reply({message:"기존 배송 요일·휴일·마감에 맞는 날짜를 선택해 주세요."},400);
    if(/pending_confirmation_revision_conflict|pending_confirmation_order_unavailable/.test(reason))return reply({message:"다른 담당자가 먼저 처리했거나 주문이 변경됐습니다. 목록을 다시 조회해 주세요."},409);
    return reply({message:"처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도하거나 목록을 다시 조회해 주세요."},409);
  }
}
