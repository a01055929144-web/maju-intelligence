import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { buildPurchaseReceiptRows, planMissingProductFields, planProductTaxTypes, type PurchaseReceiptInputLine } from "@/domains/pricing/purchase-receipt";
import { supabaseRequest } from "@/lib/store";
import { runLimited } from "@/lib/run-limited";

export const dynamic = "force-dynamic";

/**
 * 11/4: 매입 기록 보관 — 엑셀의 수량·공급가액·부가세·합계를 날짜·품목별로 남깁니다.
 * 같은 날 같은 품목을 다시 올리면 새 줄을 만들지 않고 덮어씁니다(company_id, dedupe_key).
 * 테이블(purchase_receipt_lines)은 운영 DB 승인 후 생성됩니다. 없으면 매입가 저장은 그대로 두고 안내만 합니다.
 */
/** 11/4: 매입 이력 — 최근 N일 매입 기록(품목별 변동은 화면에서 묶어 보여 줍니다). */
export async function GET(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const days = Math.min(365, Math.max(7, Number(request.nextUrl.searchParams.get("days")) || 90));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await supabaseRequest<Array<Record<string, unknown>>>(
    `purchase_receipt_lines?select=receipt_date,line_key,product_catalog_id,product_name,spec,unit,supplier_name,quantity,unit_price,unit_cost_ex_vat,price_includes_vat,tax_type,total_amount&company_id=eq.${encodeURIComponent(auth.companyId)}&receipt_date=gte.${since}&order=receipt_date.desc&limit=5000`
  ).catch(() => null);
  if (!rows) return NextResponse.json({ message: "매입 이력을 불러오지 못했습니다." }, { status: 500 });
  return NextResponse.json({ days, rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; fileName?: string; lines?: PurchaseReceiptInputLine[]; receiptDate?: string } | null;
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const receiptDate = String(body?.receiptDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) return NextResponse.json({ message: "매입일을 확인해 주세요." }, { status: 400 });
  const lines = Array.isArray(body?.lines) ? body!.lines.slice(0, 5000) : [];
  const companyId = auth.companyId;
  const productIds = Array.from(new Set(lines.map((line) => line.productId).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))));
  const products = new Map<string, string | null>();
  const productFields = new Map<string, { spec: string; unit: string }>();
  for (let offset = 0; offset < productIds.length; offset += 100) {
    const part = productIds.slice(offset, offset + 100);
    const found = await supabaseRequest<Array<{ id: string; tax_type: string | null; spec_value: number | null; spec_unit: string | null; sales_unit: string | null }>>(
      `product_catalog?select=id,tax_type,spec_value,spec_unit,sales_unit&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${part.map(encodeURIComponent).join(",")})`
    ).catch(() => []);
    for (const row of found) {
      products.set(row.id, row.tax_type);
      productFields.set(row.id, { spec: [row.spec_value, row.spec_unit].filter((value) => value != null && value !== "").join(""), unit: row.sales_unit || "" });
    }
  }
  const rows = buildPurchaseReceiptRows({
    knownProductIds: new Set(products.keys()),
    actorName: auth.customerSession?.name || auth.adminSession?.name || "운영자",
    companyId: auth.companyId,
    fileName: String(body?.fileName || "").slice(0, 200),
    lines,
    receiptDate
  });
  if (!rows.length) return NextResponse.json({ saved: 0 });
  try {
    for (let offset = 0; offset < rows.length; offset += 500) {
      await supabaseRequest("purchase_receipt_lines?on_conflict=company_id,dedupe_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.slice(offset, offset + 500))
      });
    }
    // 상품 과세 구분 채우기(비어 있는 상품만).
    const plan = planProductTaxTypes(lines, products);
    let taxFilled = 0;
    for (const taxType of ["taxable", "exempt"] as const) {
      const ids = plan.fill.filter((item) => item.taxType === taxType).map((item) => item.productId);
      for (let offset = 0; offset < ids.length; offset += 100) {
        const part = ids.slice(offset, offset + 100);
        await supabaseRequest(`product_catalog?company_id=eq.${encodeURIComponent(companyId)}&tax_type=is.null&id=in.(${part.map(encodeURIComponent).join(",")})`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ tax_type: taxType, updated_at: new Date().toISOString() })
        }).then(() => { taxFilled += part.length; }).catch(() => null);
      }
    }
    // 나중에 올린 파일로 상품의 빈 칸(규격·단위)을 채웁니다(있는 값은 그대로).
    let fieldsFilled = 0;
    await runLimited(planMissingProductFields(lines, productFields).slice(0, 300), 10, async (item) => {
      await supabaseRequest(`product_catalog?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(item.productId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...item.values, updated_at: new Date().toISOString() })
      }).then(() => { fieldsFilled += 1; }).catch(() => null);
    });
    return NextResponse.json({ fieldsFilled, saved: rows.length, taxConflicts: plan.conflicts.length, taxFilled });
  } catch (error) {
    const missing = error instanceof Error && /purchase_receipt_lines|PGRST205|42P01|404/.test(error.message);
    return NextResponse.json({ message: missing ? "DB 승인 후 시작됩니다" : "저장하지 못했습니다" }, { status: missing ? 503 : 500 });
  }
}
