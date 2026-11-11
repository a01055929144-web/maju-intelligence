import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "../../../../lib/store";
import { marginTemplateGate } from "../../../../lib/pricing/margin-template-gate";
import { templatePrice, type MarginTemplate } from "../../../../domains/pricing/margin-template";
export const dynamic = "force-dynamic";

// CC-19c: 문서 "가격 기준" — 고른 템플릿(없으면 기본)의 상품별 판매가. 매입가는 내보내지 않고 가격만 돌려준다(영업도 사용).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; templateId?: string | null; productIds?: string[] } | null;
  const g = await marginTemplateGate(request, body?.companyId, false);
  if ("error" in g) return g.error;
  const ids = Array.isArray(body?.productIds) ? Array.from(new Set(body!.productIds)) : [];
  const templateId = body?.templateId ?? null;
  if (!ids.length || ids.length > 300 || !ids.every((id) => UUID.test(id)) || (templateId !== null && !UUID.test(templateId))) return NextResponse.json({ message: "상품 1~300개와 템플릿을 확인해 주세요." }, { status: 400 });
  try {
    const products = await supabaseRequest<Array<{ product_id: string; category: string; cost: number; price: number }>>(`pricing_p0_effective?select=product_id,category,cost,price&company_id=eq.${g.companyId}&product_id=in.(${ids.join(",")})`);
    const prices: Record<string, number> = {};
    if (templateId === null) {
      for (const p of products) if (p.price > 0) prices[p.product_id] = Number(p.price);
      return NextResponse.json({ prices });
    }
    const [[template], categories, items] = await Promise.all([
      supabaseRequest<Array<{ margin_bp: number; rounding: number }>>(`margin_templates?select=margin_bp,rounding&id=eq.${templateId}&company_id=eq.${g.companyId}&archived_at=is.null`),
      supabaseRequest<Array<{ category: string; margin_bp: number }>>(`margin_template_categories?select=category,margin_bp&template_id=eq.${templateId}&company_id=eq.${g.companyId}`),
      supabaseRequest<Array<{ product_id: string; margin_bp: number | null; direct_price: number | null }>>(`margin_template_items?select=product_id,margin_bp,direct_price&template_id=eq.${templateId}&company_id=eq.${g.companyId}`),
    ]);
    if (!template) return NextResponse.json({ message: "보관됐거나 없는 템플릿입니다." }, { status: 409 });
    const model: MarginTemplate = { margin: template.margin_bp / 100, rounding: template.rounding, categories: categories.map((c) => ({ category: c.category, margin: c.margin_bp / 100 })), items: items.map((i) => ({ productId: i.product_id, margin: i.margin_bp === null ? null : i.margin_bp / 100, directPrice: i.direct_price })) };
    for (const p of products) if (Number(p.cost) > 0) prices[p.product_id] = templatePrice(model, { id: p.product_id, category: p.category, cost: Number(p.cost) }).price;
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("margin template prices failed", error);
    return NextResponse.json({ message: "가격을 계산하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
