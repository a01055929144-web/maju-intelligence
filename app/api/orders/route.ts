import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope } from "@/lib/auth";
import { StoreReviewError, confirmNewCustomer, linkExistingCustomer, reviewCandidates } from "../../../lib/pricing/store-customer-review";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { supabaseRequest } from "@/lib/store";
import { isStoreOrderStatus } from "../../../domains/order/store-order-status";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_ROLE: Record<string, string> = { owner: "점주", manager: "관리자", staff: "직원" };

type OrderRow = {
  id: string; customer_id: string; delivery_date: string | null; status: string;
  known_total: number; has_market_price: boolean; request_memo: string;
  submitted_at: string; revision: number; ordered_by_member_id: string | null; store_account_id: string | null;
  store_order_lines: Array<{ product_name: string; specification: string; sales_unit: string;
    quantity: number; total_amount: number | null; is_market_price: boolean }>;
};
type CustomerRow = { id: string; customer_name: string; address: string | null;
  delivery_base_address: string | null; delivery_address_detail: string | null };

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
  const customer = auth.customerSession;
  // 조회: 대표·관리자·영업. 확인 처리: 대표·관리자. MAJU 관리자 미리보기는 보기만.
  const canView = !customer || canManagePriceSheets(customer) || customer.workspaceRole === "sales";
  if (!canView || (write && customer && !canManagePriceSheets(customer)))
    return NextResponse.json({ message: write ? "주문 확인 권한이 없습니다." : "주문을 볼 권한이 없습니다." }, { status: 403 });
  if (write && !customer)
    return NextResponse.json({ message: "고객사 계정으로 확인해 주세요." }, { status: 403 });
  return auth.companyId;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const scope = await authorize(request, false, params.get("companyId") || undefined);
  if (typeof scope !== "string") return scope;
  const company = encodeURIComponent(scope);
  const page = Math.max(1, Math.min(500, Number.parseInt(params.get("page") || "1", 10) || 1));
  const status = params.get("status") || "submitted";
  const storeQuery = (params.get("q") || "").trim();
  if (status !== "all" && !isStoreOrderStatus(status))
    return NextResponse.json({ message: "주문 상태를 다시 선택해 주세요." }, { status: 400 });
  if (storeQuery && (storeQuery.length < 2 || storeQuery.length > 50 || /[%*,()]/.test(storeQuery)))
    return NextResponse.json({ message: "매장 이름을 두 글자 이상 입력해 주세요." }, { status: 400 });
  try {
    let customerFilter = "";
    if (storeQuery) {
      // shortcut: 이름이 맞는 매장 200곳까지만 찾는다. 매장이 수천 곳이 되면 서버 검색 RPC로 바꾼다.
      const matched = await supabaseRequest<Array<{ id: string }>>(
        `normalized_customers?company_id=eq.${company}&customer_name=ilike.*${encodeURIComponent(storeQuery)}*&select=id&limit=200`,
      );
      if (!matched.length) return NextResponse.json({ hasMore: false, items: [] }, { headers: { "Cache-Control": "no-store" } });
      customerFilter = `&customer_id=in.(${matched.map((row) => row.id).join(",")})`;
    }
    const orders = await supabaseRequest<OrderRow[]>(
      `store_orders?company_id=eq.${company}${status === "all" ? "" : `&status=eq.${status}`}${customerFilter}` +
      "&select=id,customer_id,delivery_date,status,known_total,has_market_price,request_memo,submitted_at,revision,ordered_by_member_id,store_account_id," +
      "store_order_lines(product_name,specification,sales_unit,quantity,total_amount,is_market_price)" +
      `&order=submitted_at.desc,id.desc&limit=${PAGE_SIZE + 1}&offset=${(page - 1) * PAGE_SIZE}`,
    );
    const items = orders.slice(0, PAGE_SIZE);
    const customerIds = Array.from(new Set(items.map((order) => order.customer_id)));
    const memberIds = Array.from(new Set(items.map((order) => order.ordered_by_member_id).filter((id): id is string => Boolean(id))));
    const accountIds = Array.from(new Set(items.map((order) => order.store_account_id).filter((id): id is string => Boolean(id))));
    const [customers, members, pending] = await Promise.all([
      customerIds.length ? supabaseRequest<CustomerRow[]>(
        `normalized_customers?company_id=eq.${company}&id=in.(${customerIds.join(",")})&select=id,customer_name,address,delivery_base_address,delivery_address_detail`,
      ) : Promise.resolve([]),
      memberIds.length ? supabaseRequest<Array<{ id: string; role: string; app_users: { name: string | null } | null }>>(
        `store_account_members?company_id=eq.${company}&id=in.(${memberIds.join(",")})&select=id,role,app_users(name)`,
      ) : Promise.resolve([]),
      accountIds.length ? supabaseRequest<Array<{ id: string }>>(
        `store_accounts?company_id=eq.${company}&id=in.(${accountIds.join(",")})&customer_review_status=eq.needs_review&select=id`,
      ) : Promise.resolve([]),
    ]);
    const needsReview = new Set(pending.map((row) => row.id));
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const memberLabel = new Map(members.map((member) => [member.id,
      `${member.app_users?.name?.trim().slice(0, 80) || "이름 미등록"} · ${MEMBER_ROLE[member.role] || "구성원"}`]));
    return NextResponse.json({
      hasMore: orders.length > PAGE_SIZE,
      items: items.map((order) => {
        const customer = customerById.get(order.customer_id);
        const base = customer?.delivery_base_address?.trim();
        return {
          id: order.id,
          storeAccountId: order.store_account_id && needsReview.has(order.store_account_id) ? order.store_account_id : null,
          customerName: customer?.customer_name ?? "이름 없는 거래처",
          // 주문 당시 배송지 저장(#410)이 적용되기 전이라 지금 거래처에 저장된 주소를 보여 준다.
          deliveryAddress: base ? [base, customer?.delivery_address_detail?.trim()].filter(Boolean).join(" ") : customer?.address?.trim() || null,
          orderedBy: order.ordered_by_member_id ? memberLabel.get(order.ordered_by_member_id) ?? "작성자 확인 필요" : "기존 링크 주문",
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
        };
      }),
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
  if (body.action === "candidates" || body.action === "confirm_customer" || body.action === "link_customer") return reviewAction(request, scope, body);
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
  } catch (error) {
    if (error instanceof Error && error.message.includes("store_customer_review_required"))
      return NextResponse.json({ message: "이 매장은 첫 거래 거래처 확인이 필요합니다. 주문 줄의 '거래처 확인'을 먼저 해 주세요." }, { status: 409 });
    return NextResponse.json({ message: "주문을 확인 처리하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}

// CC-08: 첫 거래 거래처 확인(후보 보기·새 거래처로 확인·기존 거래처에 연결). 대표·관리자만(authorize가 막음).
async function reviewAction(request: NextRequest, companyId: string, body: Record<string, unknown>) {
  const auth = await getRequestAuthScope(request, companyId);
  const accountId = body.storeAccountId;
  if (typeof accountId !== "string" || !UUID.test(accountId)) return NextResponse.json({ message: "매장을 다시 선택해 주세요." }, { status: 400 });
  const actor = { userId: auth.ok ? auth.customerSession?.userId : null, name: (auth.ok && getCustomerOperationalName(auth.customerSession)) || "운영자" };
  try {
    if (body.action === "candidates") return NextResponse.json({ candidates: await reviewCandidates(companyId, accountId) });
    if (body.action === "confirm_customer") return NextResponse.json(await confirmNewCustomer(companyId, accountId, actor));
    if (typeof body.customerId !== "string" || !UUID.test(body.customerId)) return NextResponse.json({ message: "연결할 거래처를 다시 선택해 주세요." }, { status: 400 });
    return NextResponse.json(await linkExistingCustomer(companyId, accountId, body.customerId, actor));
  } catch (error) {
    if (error instanceof StoreReviewError) return NextResponse.json({ message: error.message }, { status: error.status });
    return NextResponse.json({ message: "거래처 확인을 처리하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
