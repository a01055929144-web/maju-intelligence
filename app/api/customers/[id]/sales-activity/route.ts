import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { aggregateSalesProducts, mergeSalesHistory, type SalesHistoryRow, type SalesLine } from "@/domains/customer/sales-activity";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

// CC-25: 매출처 "매출 상품"·"거래내역" 탭의 읽기 전용 조회. 매출 전표(확정)·매장 주문(취소 제외)·입금을 한 번에 돌려준다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;
const ORDER_STATUS: Record<string, string> = { submitted: "접수", received: "확인", in_delivery: "배송 중", delivered: "배송 완료", cancelled: "취소" };
const DOC_STATUS: Record<string, string> = { draft: "작성 중", confirmed: "확정", cancelled: "취소" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "거래 내역을 볼 권한이 없습니다." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ message: "매출처를 확인해 주세요." }, { status: 400 });
  const company = enc(scope.companyId), customer = enc(id);
  try {
    const [docs, orders, receipts] = await Promise.all([
      supabaseRequest<Array<{ id: string; document_number: string; document_date: string; status: string; total_amount: number }>>(`business_documents?select=id,document_number,document_date,status,total_amount&company_id=eq.${company}&customer_id=eq.${customer}&document_type=eq.sale&status=neq.draft&order=document_date.desc&limit=500`),
      supabaseRequest<Array<{ id: string; delivery_date: string; status: string; known_total: number }>>(`store_orders?select=id,delivery_date,status,known_total&company_id=eq.${company}&customer_id=eq.${customer}&order=delivery_date.desc&limit=500`),
      supabaseRequest<Array<{ id: string; entry_date: string; amount: number; payment_method: string | null }>>(`partner_ledger_entries?select=id,entry_date,amount,payment_method&company_id=eq.${company}&customer_id=eq.${customer}&entry_type=eq.receipt&order=entry_date.desc&limit=500`),
    ]);
    const liveDocs = docs.filter((d) => d.status === "confirmed"), liveOrders = orders.filter((o) => o.status !== "cancelled");
    const [docLines, orderLines] = await Promise.all([
      liveDocs.length ? supabaseRequest<Array<{ document_id: string; product_catalog_id: string | null; product_name_snapshot: string; unit_snapshot: string; quantity: number; unit_price: number }>>(`business_document_lines?select=document_id,product_catalog_id,product_name_snapshot,unit_snapshot,quantity,unit_price&company_id=eq.${company}&document_id=in.(${liveDocs.map((d) => d.id).join(",")})&limit=5000`) : Promise.resolve([]),
      liveOrders.length ? supabaseRequest<Array<{ order_id: string; product_id: string; product_name: string; sales_unit: string; quantity: number; unit_price: number | null }>>(`store_order_lines?select=order_id,product_id,product_name,sales_unit,quantity,unit_price&company_id=eq.${company}&order_id=in.(${liveOrders.map((o) => o.id).join(",")})&limit=5000`) : Promise.resolve([]),
    ]);
    const docDate = new Map(liveDocs.map((d) => [d.id, d.document_date])), orderDate = new Map(liveOrders.map((o) => [o.id, o.delivery_date]));
    const lines: SalesLine[] = [
      ...docLines.map((l) => ({ key: l.product_catalog_id || `name:${l.product_name_snapshot}`, name: l.product_name_snapshot, unit: l.unit_snapshot, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), date: docDate.get(l.document_id) || "" })),
      ...orderLines.map((l) => ({ key: l.product_id, name: l.product_name, unit: l.sales_unit, quantity: Number(l.quantity), unitPrice: l.unit_price === null ? null : Number(l.unit_price), date: orderDate.get(l.order_id) || "" })),
    ];
    // 지금 적용 가격: 이 매장 가격(시작일이 오늘 이하) > 기본 판매가. 가격 관리가 꺼져 있으면 빈 값.
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const [base, agreements] = await Promise.all([
      supabaseRequest<Array<{ product_id: string; price: number }>>(`pricing_p0_effective?select=product_id,price&company_id=eq.${company}&active=eq.true&price=gt.0&limit=5000`).catch(() => []),
      supabaseRequest<Array<{ product_catalog_id: string; unit_price: number; source_quote_id: string | null }>>(`customer_price_agreements?select=product_catalog_id,unit_price,source_quote_id&company_id=eq.${company}&customer_id=eq.${customer}&status=eq.active&effective_from=lte.${today}&limit=5000`).catch(() => []),
    ]);
    const prices = new Map<string, { base: number | null; agreement: { price: number; fromQuote: boolean } | null }>();
    for (const key of Array.from(new Set(lines.map((l) => l.key)))) prices.set(key, { base: null, agreement: null });
    for (const b of base) if (prices.has(b.product_id)) prices.get(b.product_id)!.base = Number(b.price);
    for (const a of agreements) if (prices.has(a.product_catalog_id)) prices.get(a.product_catalog_id)!.agreement = { price: Number(a.unit_price), fromQuote: Boolean(a.source_quote_id) };
    const history = mergeSalesHistory(
      docs.map<SalesHistoryRow>((d) => ({ id: `doc-${d.id}`, kind: "sale", date: d.document_date, label: d.document_number, amount: Number(d.total_amount), status: DOC_STATUS[d.status] || d.status })),
      orders.map<SalesHistoryRow>((o) => ({ id: `order-${o.id}`, kind: "order", date: o.delivery_date, label: "매장 주문", amount: Number(o.known_total), status: ORDER_STATUS[o.status] || o.status })),
      receipts.map<SalesHistoryRow>((r) => ({ id: `receipt-${r.id}`, kind: "receipt", date: r.entry_date, label: "입금", amount: Number(r.amount), status: r.payment_method || "" })),
    );
    return NextResponse.json({ products: aggregateSalesProducts(lines, prices), history }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "거래 내역을 불러오지 못했습니다." }, { status: 500 });
  }
}
