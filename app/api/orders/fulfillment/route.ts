import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { orderFulfillmentEnabled } from "@/lib/order-fulfillment-feature";
import { readOrderFulfillment } from "@/lib/order-fulfillment-read";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const deliveryDate = request.nextUrl.searchParams.get("deliveryDate") || "";
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.companyId || !orderFulfillmentEnabled(auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const customer = auth.customerSession;
  if (customer && !canManagePriceSheets(customer) && !["sales", "delivery"].includes(customer.workspaceRole || ""))
    return NextResponse.json({ message: "출고 준비를 볼 권한이 없습니다." }, { status: 403 });
  if (!DATE.test(deliveryDate)) return NextResponse.json({ message: "배송일을 다시 선택해 주세요." }, { status: 400 });
  try {
    return NextResponse.json({ items: await readOrderFulfillment(auth.companyId, deliveryDate) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "출고 준비 자료를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
