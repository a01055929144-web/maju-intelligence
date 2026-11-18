import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { orderFulfillmentEnabled } from "@/lib/order-fulfillment-feature";
import { readOrderFulfillment } from "@/lib/order-fulfillment-read";
import { dispatchStoreOrders } from "@/lib/order-fulfillment-dispatch";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    companyId?: string; orderIds?: string[]; idempotencyKey?: string;
  } | null;
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.companyId || !orderFulfillmentEnabled(auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(auth, "manage_sales")) return NextResponse.json({ message: "출고를 확정할 권한이 없습니다." }, { status: 403 });
  const orderIds = Array.from(new Set(body?.orderIds || []));
  if (!orderIds.length || orderIds.length > 500 || orderIds.some((id) => !UUID.test(id)) || !UUID.test(body?.idempotencyKey || "")) {
    return NextResponse.json({ message: "출고할 주문을 다시 선택해 주세요." }, { status: 400 });
  }
  try {
    const items = await dispatchStoreOrders(auth.companyId, orderIds, body!.idempotencyKey!, {
      userId: auth.customerSession?.userId,
      name: auth.customerSession?.name || auth.adminSession?.name || "운영자",
    });
    return NextResponse.json({ items });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const message = detail.includes("amount_mismatch") ? "주문 금액과 작성중 전표가 다릅니다. 전표를 확인해 주세요."
      : detail.includes("inventory_unresolved") ? "재고 상품 또는 단위 환산을 먼저 확인해 주세요."
        : detail.includes("state_conflict") ? "이미 처리됐거나 상태가 바뀐 주문입니다. 새로고침해 주세요."
          : "출고를 확정하지 못했습니다. 주문과 작성중 전표를 확인해 주세요.";
    return NextResponse.json({ message }, { status: 409 });
  }
}
