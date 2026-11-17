import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { createCustomerAttachmentSignedUrl, supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private, max-age=0" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") ?? "";
  const storeAccountId = request.nextUrl.searchParams.get("storeAccountId") ?? "";
  const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
  if (![companyId, storeAccountId, orderId].every(value => uuid.test(value))) return NextResponse.json({ message: "주문을 확인해 주세요." }, { status: 400, headers: noStore });
  const member = await getStoreMemberContext({ companyId, storeAccountId });
  if (!member) return NextResponse.json({ message: "매장 구성원 로그인이 필요합니다." }, { status: 401, headers: noStore });
  if (!isFeatureEnabled("DELIVERY_ORDER_PHOTOS", member.companyId)) return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404, headers: noStore });
  const company = encodeURIComponent(member.companyId), account = encodeURIComponent(member.storeAccountId), order = encodeURIComponent(orderId);
  const stores = await supabaseRequest<Array<{ customer_id: string }>>(`store_accounts?select=customer_id&company_id=eq.${company}&id=eq.${account}&status=eq.active&limit=1`);
  const customerId = stores[0]?.customer_id;
  if (!customerId) return NextResponse.json({ message: "매장을 찾지 못했습니다." }, { status: 404, headers: noStore });
  const owned = await supabaseRequest<Array<{ id: string }>>(
    `store_orders?select=id&company_id=eq.${company}&customer_id=eq.${encodeURIComponent(customerId)}&id=eq.${order}&or=(store_account_id.eq.${account},store_account_id.is.null)&limit=1`,
  );
  if (!owned.length) return NextResponse.json({ message: "주문을 찾지 못했습니다." }, { status: 404, headers: noStore });
  const rows = await supabaseRequest<Array<{ id: string; storage_path: string; sort_order: number }>>(
    `delivery_route_stop_photos?select=id,storage_path,sort_order&company_id=eq.${company}&order_id=eq.${order}&order=sort_order.asc&limit=5`,
  );
  const signed = await Promise.all(rows.map(async row => {
    const segments = row.storage_path.split("/");
    if (segments[0] !== member.companyId || segments.some(segment => !segment || segment === "." || segment === "..")) return null;
    const url = await createCustomerAttachmentSignedUrl(row.storage_path, 600).catch(() => "");
    return url ? { id: row.id, sortOrder: row.sort_order, url } : null;
  }));
  return NextResponse.json({ photos: signed.filter((photo): photo is { id: string; sortOrder: number; url: string } => photo !== null) }, { headers: noStore });
}
