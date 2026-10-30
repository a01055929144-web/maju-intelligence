import { NextRequest, NextResponse } from "next/server";
import { dateField, isId } from "@/domains/pricing/document";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { readStorefront } from "@/lib/pricing/storefront";
import { toPublicStorefront } from "@/lib/pricing/storefront-public";
import { verifyStoreLinkToken } from "@/lib/pricing/store-link-token";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json(
    { message: "매장 링크를 사용할 수 없습니다." },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return (
      new URL(origin).host.toLowerCase() ===
      (request.headers.get("host") || request.nextUrl.host).toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) return unavailable();
  if (!sameOrigin(request))
    return NextResponse.json(
      { message: "같은 화면에서 다시 시도해 주세요." },
      { status: 403 },
    );
  try {
    const body = (await request.json()) as {
      token?: unknown;
      deliveryDate?: unknown;
      historyPage?: unknown;
    };
    if (typeof body.token !== "string" || body.token.length > 200)
      return unavailable();
    const token = body.token;
    const requestedDate =
      body.deliveryDate === undefined ? undefined : body.deliveryDate;
    if (requestedDate !== undefined && typeof requestedDate !== "string")
      return NextResponse.json(
        { message: "배송일을 확인해 주세요." },
        { status: 400 },
      );
    if (requestedDate) {
      try {
        dateField(requestedDate);
      } catch {
        return NextResponse.json(
          { message: "배송일을 확인해 주세요." },
          { status: 400 },
        );
      }
    }
    const historyPage =
      body.historyPage === undefined ? 1 : Number(body.historyPage);
    if (
      !Number.isSafeInteger(historyPage) ||
      historyPage < 1 ||
      historyPage > 1000
    )
      return NextResponse.json(
        { message: "내역 페이지를 확인해 주세요." },
        { status: 400 },
      );
    const store = await readStorefront(token, requestedDate);
    if (!store) return unavailable();
    const orders = store.priceAvailable
      ? await supabaseRequest<
          {
            id: string;
            delivery_date: string;
            status: string;
            known_total: number;
            has_market_price: boolean;
            submitted_at: string;
            revision: number;
          }[]
        >(
          `store_orders?company_id=eq.${encodeURIComponent(store.companyId)}&customer_id=eq.${store.customerId}&select=id,delivery_date,status,known_total,has_market_price,submitted_at,revision&order=submitted_at.desc,id.desc&limit=11&offset=${(historyPage - 1) * 10}`,
        )
      : [];
    const visibleOrders = orders.slice(0, 10);
    const orderIds = visibleOrders.map((order) => order.id);
    const lines = orderIds.length
      ? await supabaseRequest<
          {
            order_id: string;
            product_id: string;
            promotion_id: string | null;
            product_name: string;
            specification: string;
            sales_unit: string;
            quantity: number;
            unit_price: number | null;
            tax_type: string;
            supply_amount: number | null;
            tax_amount: number | null;
            total_amount: number | null;
          }[]
        >(
          `store_order_lines?company_id=eq.${encodeURIComponent(store.companyId)}&order_id=in.(${orderIds.join(",")})&select=order_id,product_id,promotion_id,product_name,specification,sales_unit,quantity,unit_price,tax_type,supply_amount,tax_amount,total_amount&limit=1000`,
        )
      : [];
    const byOrder = new Map<string, typeof lines>();
    for (const line of lines)
      byOrder.set(line.order_id, [...(byOrder.get(line.order_id) ?? []), line]);
    const productIds = Array.from(
      new Set(store.lines.map((line) => line.productId)),
    );
    const preferences = productIds.length
      ? await supabaseRequest<
          {
            product_id: string;
            is_favorite: boolean;
            is_hidden: boolean;
            will_not_order: boolean;
          }[]
        >(
          `store_product_preferences?company_id=eq.${encodeURIComponent(store.companyId)}&customer_id=eq.${store.customerId}&product_id=in.(${productIds.join(",")})&select=product_id,is_favorite,is_hidden,will_not_order&limit=100`,
        )
      : [];
    const verified = verifyStoreLinkToken(token);
    if (verified) {
      const device = /mobile/i.test(request.headers.get("user-agent") || "")
        ? "mobile"
        : "desktop";
      await supabaseRequest("rpc/record_storefront_view", {
        method: "POST",
        body: JSON.stringify({
          p_token_hash: verified.hash,
          p_device_class: device,
        }),
      }).catch(() => null);
    }
    return NextResponse.json(
      {
        store: toPublicStorefront(store),
        preferences: preferences.map((item) => ({
          productId: item.product_id,
          isFavorite: item.is_favorite,
          isHidden: item.is_hidden,
          willNotOrder: item.will_not_order,
        })),
        historyPage,
        historyHasMore: orders.length > 10,
        orders: visibleOrders.map((order) => ({
          id: order.id,
          deliveryDate: order.delivery_date,
          status: order.status,
          knownTotal: order.known_total,
          marketPricePending: order.has_market_price,
          submittedAt: order.submitted_at,
          revision: order.revision,
          lines: byOrder.get(order.id) ?? [],
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { message: "매장 주문을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) return unavailable();
  if (!sameOrigin(request))
    return NextResponse.json(
      { message: "같은 화면에서 다시 시도해 주세요." },
      { status: 403 },
    );
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.token !== "string" ||
      body.token.length > 200 ||
      !isId(body.productId) ||
      typeof body.isFavorite !== "boolean" ||
      typeof body.isHidden !== "boolean" ||
      typeof body.willNotOrder !== "boolean"
    )
      return NextResponse.json(
        { message: "품목 설정을 확인해 주세요." },
        { status: 400 },
      );
    const store = await readStorefront(body.token);
    if (
      !store ||
      !store.lines.some((line) => line.productId === body.productId)
    )
      return unavailable();
    await supabaseRequest(
      "store_product_preferences?on_conflict=company_id,customer_id,product_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          company_id: store.companyId,
          customer_id: store.customerId,
          product_id: body.productId,
          is_favorite: body.isFavorite,
          is_hidden: body.isHidden,
          will_not_order: body.willNotOrder,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return NextResponse.json(
      { saved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { message: "품목 설정을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) return unavailable();
  if (!sameOrigin(request))
    return NextResponse.json(
      { message: "같은 화면에서 다시 시도해 주세요." },
      { status: 403 },
    );
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { message: "주문 내용을 확인해 주세요." },
      { status: 400 },
    );
  }
  const verified =
    typeof body.token === "string" && body.token.length <= 200
      ? verifyStoreLinkToken(body.token)
      : null;
  if (!verified) return unavailable();
  if (
    !isId(body.idempotencyKey) ||
    (body.orderId !== null &&
      body.orderId !== undefined &&
      !isId(body.orderId)) ||
    (body.orderId != null &&
      (!Number.isSafeInteger(body.expectedRevision) ||
        Number(body.expectedRevision) < 1)) ||
    typeof body.deliveryDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.deliveryDate) ||
    typeof body.memo !== "string" ||
    body.memo.length > 500 ||
    !Array.isArray(body.lines) ||
    body.lines.length < 1 ||
    body.lines.length > 100 ||
    !body.lines.every(
      (line) =>
        line &&
        typeof line === "object" &&
        isId((line as Record<string, unknown>).productId) &&
        ((line as Record<string, unknown>).promotionId == null ||
          isId((line as Record<string, unknown>).promotionId)) &&
        typeof (line as Record<string, unknown>).quantity === "number" &&
        Number.isFinite((line as Record<string, unknown>).quantity) &&
        Number((line as Record<string, unknown>).quantity) > 0 &&
        Number((line as Record<string, unknown>).quantity) <= 100000 &&
        Number.isInteger(
          Number((line as Record<string, unknown>).quantity) * 1000,
        ),
    )
  )
    return NextResponse.json(
      { message: "배송일과 품목·수량을 확인해 주세요." },
      { status: 400 },
    );
  try {
    dateField(body.deliveryDate);
  } catch {
    return NextResponse.json(
      { message: "배송일을 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    // Resolve tenant eligibility from the signed link, never from caller scope.
    const store = await readStorefront(String(body.token), body.deliveryDate);
    if (!store) return unavailable();
    const result = await supabaseRequest<Record<string, unknown>>(
      "rpc/place_store_order",
      {
        method: "POST",
        body: JSON.stringify({
          p_token_hash: verified.hash,
          p_delivery_date: body.deliveryDate,
          p_lines: body.lines,
          p_idempotency_key: body.idempotencyKey,
          p_order_id: body.orderId ?? null,
          p_expected_revision: body.expectedRevision ?? null,
          p_memo: body.memo,
        }),
      },
    );
    return NextResponse.json(
      { result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const friendly = /Delivery date unavailable/.test(message)
      ? "배송 가능일과 마감 시각을 다시 확인해 주세요."
      : /Minimum order not met/.test(message)
        ? "최소 주문금액을 확인해 주세요."
        : /Promotion unavailable/.test(message)
          ? "행사 품목의 기간·재고를 다시 확인해 주세요."
          : /Idempotency conflict|Order cannot be edited/.test(message)
            ? "이미 변경된 주문입니다. 내역을 새로고침해 주세요."
            : "주문을 저장하지 못했습니다. 품목과 가격을 새로고침해 주세요.";
    return NextResponse.json({ message: friendly }, { status: 409 });
  }
}
