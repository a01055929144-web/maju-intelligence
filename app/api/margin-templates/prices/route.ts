import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "../../../../lib/store";
import { marginTemplateGate } from "../../../../lib/pricing/margin-template-gate";
import { templatePrice, type MarginTemplate } from "../../../../domains/pricing/margin-template";
import { pickDocumentPrice, type DocumentPriceSource } from "../../../../domains/pricing/document-price";
export const dynamic = "force-dynamic";

// CC-19c: 문서 "가격 기준" — 고른 템플릿(없으면 기본)의 상품별 판매가. 매입가는 내보내지 않고 가격만 돌려준다(영업도 사용).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// CC-30d: 문서에서 받는 매장 찾기(이름 검색, 영업도 가능). id·이름만 돌려준다.
export async function GET(request: NextRequest) {
  const g = await marginTemplateGate(request, request.nextUrl.searchParams.get("companyId") || undefined, false);
  if ("error" in g) return g.error;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60).replace(/[%*,()]/g, " ");
  if (!q) return NextResponse.json({ customers: [] });
  try {
    const rows = await supabaseRequest<Array<{ id: string; customer_name: string }>>(`normalized_customers?select=id,customer_name&company_id=eq.${g.companyId}&duplicate_of=is.null&customer_name=ilike.*${encodeURIComponent(q)}*&order=customer_name&limit=20`);
    return NextResponse.json({ customers: rows.map((r) => ({ id: r.id, name: r.customer_name })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "매장을 찾지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; templateId?: string | null; customerId?: string | null; productIds?: string[] } | null;
  const g = await marginTemplateGate(request, body?.companyId, false);
  if ("error" in g) return g.error;
  const ids = Array.isArray(body?.productIds) ? Array.from(new Set(body!.productIds)) : [];
  const customerId = body?.customerId ?? null;
  let templateId = body?.templateId ?? null;
  if (customerId !== null && !UUID.test(customerId)) return NextResponse.json({ message: "받는 매장을 확인해 주세요." }, { status: 400 });
  if (!ids.length || ids.length > 300 || !ids.every((id) => UUID.test(id)) || (templateId !== null && !UUID.test(templateId))) return NextResponse.json({ message: "상품 1~300개와 템플릿을 확인해 주세요." }, { status: 400 });
  try {
    const products = await supabaseRequest<Array<{ product_id: string; category: string; cost: number; price: number }>>(`pricing_p0_effective?select=product_id,category,cost,price&company_id=eq.${g.companyId}&product_id=in.(${ids.join(",")})`);
    // CC-30d: 받는 매장이 있으면 매장 가격(오늘 유효한 약정가)을 먼저 보고, 등급은 매장에 지정된 것을 쓴다(요청에 등급이 따로 오면 그것).
    let customerGrade: string | null = null;
    const storePrices = new Map<string, number>();
    if (customerId) {
      const [customer] = await supabaseRequest<Array<{ margin_template_id: string | null }>>(`normalized_customers?select=margin_template_id&id=eq.${customerId}&company_id=eq.${g.companyId}&duplicate_of=is.null`);
      if (!customer) return NextResponse.json({ message: "받는 매장을 찾지 못했습니다." }, { status: 409 });
      customerGrade = customer.margin_template_id;
      if (body?.templateId === undefined) templateId = customerGrade;
      const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const agreements = await supabaseRequest<Array<{ product_catalog_id: string; unit_price: number; effective_from: string; effective_until: string | null }>>(`customer_price_agreements?select=product_catalog_id,unit_price,effective_from,effective_until&company_id=eq.${g.companyId}&customer_id=eq.${customerId}&status=eq.active&product_catalog_id=in.(${ids.join(",")})`);
      for (const a of agreements) if (a.effective_from <= today && (!a.effective_until || a.effective_until >= today)) storePrices.set(a.product_catalog_id, Number(a.unit_price));
    }
    let model: MarginTemplate | null = null;
    if (templateId !== null) {
      const [[template], categories, items] = await Promise.all([
        supabaseRequest<Array<{ margin_bp: number; rounding: number }>>(`margin_templates?select=margin_bp,rounding&id=eq.${templateId}&company_id=eq.${g.companyId}&archived_at=is.null`),
        supabaseRequest<Array<{ category: string; margin_bp: number }>>(`margin_template_categories?select=category,margin_bp&template_id=eq.${templateId}&company_id=eq.${g.companyId}`),
        supabaseRequest<Array<{ product_id: string; margin_bp: number | null; direct_price: number | null }>>(`margin_template_items?select=product_id,margin_bp,direct_price&template_id=eq.${templateId}&company_id=eq.${g.companyId}`),
      ]);
      if (!template) return NextResponse.json({ message: "보관됐거나 없는 템플릿입니다." }, { status: 409 });
      model = { margin: template.margin_bp / 100, rounding: template.rounding, categories: categories.map((c) => ({ category: c.category, margin: c.margin_bp / 100 })), items: items.map((i) => ({ productId: i.product_id, margin: i.margin_bp === null ? null : i.margin_bp / 100, directPrice: i.direct_price })) };
    }
    const prices: Record<string, number> = {}, sources: Record<string, DocumentPriceSource> = {};
    for (const p of products) {
      const grade = model && Number(p.cost) > 0 ? templatePrice(model, { id: p.product_id, category: p.category, cost: Number(p.cost) }).price : null;
      // 템플릿이 없을 때 기본 가격은 pricing_p0_effective.price(가격 관리 판매가) 그대로, 있으면 등급가가 기본을 대신한다.
      const picked = pickDocumentPrice({ store: storePrices.get(p.product_id), grade, base: model ? null : Number(p.price) });
      if (picked) { prices[p.product_id] = picked.price; sources[p.product_id] = picked.source; }
    }
    return NextResponse.json({ prices, sources, gradeId: customerGrade });
  } catch (error) {
    console.error("margin template prices failed", error);
    return NextResponse.json({ message: "가격을 계산하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
