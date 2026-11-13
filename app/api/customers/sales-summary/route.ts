import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { summarizeCustomerSales } from "@/domains/customer/sales-activity";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

// CC-25: 매출처 목록 열(매장 가격 수·최근 거래일·이번 달 매출). 읽기 전용, 회사 전체를 한 번에 집계.
// shortcut: 건당 limit 20000 — 이 이상이면 최근 거래일·매출이 잘린다. 거래가 그만큼 늘면 DB 집계 RPC로 올린다.
const enc = encodeURIComponent;

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "거래 내역을 볼 권한이 없습니다." }, { status: 403 });
  const company = enc(scope.companyId);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  try {
    const [docs, orders, agreements] = await Promise.all([
      supabaseRequest<Array<{ customer_id: string; document_date: string; total_amount: number }>>(`business_documents?select=customer_id,document_date,total_amount&company_id=eq.${company}&document_type=eq.sale&status=eq.confirmed&customer_id=not.is.null&limit=20000`),
      supabaseRequest<Array<{ customer_id: string; delivery_date: string; known_total: number }>>(`store_orders?select=customer_id,delivery_date,known_total&company_id=eq.${company}&status=neq.cancelled&customer_id=not.is.null&limit=20000`),
      supabaseRequest<Array<{ customer_id: string }>>(`customer_price_agreements?select=customer_id&company_id=eq.${company}&status=eq.active&effective_from=lte.${today}&limit=20000`).catch(() => []),
    ]);
    const summary = summarizeCustomerSales(
      [
        ...docs.map((d) => ({ customerId: d.customer_id, date: d.document_date, amount: Number(d.total_amount) || 0 })),
        ...orders.map((o) => ({ customerId: o.customer_id, date: o.delivery_date, amount: Number(o.known_total) || 0 })),
      ],
      agreements.map((a) => a.customer_id),
      today.slice(0, 7),
    );
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "매출 요약을 불러오지 못했습니다." }, { status: 500 });
  }
}
