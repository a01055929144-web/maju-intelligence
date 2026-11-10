import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OrderRow = {
  id: string; customer_id: string; delivery_date: string | null; status: string;
  known_total: number; has_market_price: boolean; request_memo: string;
  submitted_at: string; revision: number;
  store_order_lines: Array<{ product_name: string; specification: string; sales_unit: string;
    quantity: number; total_amount: number | null; is_market_price: boolean }>;
};

function unavailable() {
  return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
}

function sameOrigin(request: NextRequest) {
  const raw = request.headers.get("origin");
  if (!raw) return true;
  try {
    const origin = new URL(raw);
    return ["http:", "https:"].includes(origin.protocol) &&
      origin.host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase();
  } catch { return false; }
}

async function authorize(request: NextRequest, write: boolean, companyId?: string) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) return unavailable();
  if (write && !sameOrigin(request))
    return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.companyId || !(isFeatureEnabled("PRICING", auth.companyId) && isFeatureEnabled("STORE_ORDERING", auth.companyId)))
    return unavailable();
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession))
    return NextResponse.json({ message: "주문 확인 권한이 없습니다." }, { status: 403 });
  // MAJU 관리자는 미리보기만 한다. 고객사 주문 확인은 고객사 직원만 한다.
  if (write && !auth.customerSession)
    return NextResponse.json({ message: "고객사 계정으로 확인해 주세요." }, { status: 403 });
  return auth.companyId;
}

export async function GET(request: NextRequest) {
  const scope = await authorize(request, false, request.nextUrl.searchParams.get("companyId") || undefined);
  if (typeof scope !== "string") return scope;
  const company = encodeURIComponent(scope);
  const page = Math.max(1, Math.min(500, Number.parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1));
  const onlyNew = request.nextUrl.searchParams.get("view") !== "all";
  try {
    const orders = await supabaseRequest<OrderRow[]>(
      `store_orders?company_id=eq.${company}${onlyNew ? "&status=eq.submitted" : ""}` +
      "&select=id,customer_id,delivery_date,status,known_total,has_market_price,request_memo,submitted_at,revision," +
      "store_order_lines(product_name,specification,sales_unit,quantity,total_amount,is_market_price)" +
      `&order=submitted_at.desc,id.desc&limit=${PAGE_SIZE + 1}&offset=${(page - 1) * PAGE_SIZE}`,
    );
    const items = orders.slice(0, PAGE_SIZE);
    const customerIds = Array.from(new Set(items.map((order) => order.customer_id)));
    const customers = customerIds.length ? await supabaseRequest<Array<{ id: string; customer_name: string }>>(
      `normalized_customers?company_id=eq.${company}&id=in.(${customerIds.join(",")})&select=id,customer_name`,
    ) : [];
    const names = new Map(customers.map((customer) => [customer.id, customer.customer_name]));
    return NextResponse.json({
      hasMore: orders.length > PAGE_SIZE,
      items: items.map((order) => ({
        id: order.id,
        customerName: names.get(order.customer_id) ?? "이름 없는 거래처",
        deliveryDate: order.delivery_date,
        status: order.status,
        knownTotal: order.known_total,
        hasMarketPrice: order.has_market_price,
        requestMemo: order.request_memo,
        submittedAt: order.submitted_at,
        revision: order.revision,
        lines: order.store_order_lines.map((line) => ({
          name: line.product_name, spec: line.specification, unit: line.sales_unit,
          quantity: line.quantity, total: line.total_amount, marketPrice: line.is_market_price,
        })),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "주문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ message: "입력값을 확인해 주세요." }, { status: 400 }); }
  const scope = await authorize(request, true, typeof body.companyId === "string" ? body.companyId : undefined);
  if (typeof scope !== "string") return scope;
  const { orderId, revision } = body;
  if (body.action !== "confirm" || typeof orderId !== "string" || !UUID.test(orderId) ||
    typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1)
    return NextResponse.json({ message: "확인할 주문을 다시 선택해 주세요." }, { status: 400 });
  try {
    // status·revision 조건을 한 번의 UPDATE에 넣어 점주 수정과 동시에 눌려도 한쪽만 성공한다.
    const updated = await supabaseRequest<Array<{ id: string; status: string; revision: number }>>(
      `store_orders?company_id=eq.${encodeURIComponent(scope)}&id=eq.${orderId}&status=eq.submitted&revision=eq.${revision}&select=id,status,revision`,
      { method: "PATCH", body: JSON.stringify({ status: "received", revision: revision + 1, updated_at: new Date().toISOString() }) },
    );
    const order = updated?.[0];
    if (!order)
      return NextResponse.json({ message: "점주가 방금 수정했거나 이미 처리된 주문입니다. 새로고침 후 다시 확인해 주세요." }, { status: 409 });
    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ message: "주문을 확인 처리하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
