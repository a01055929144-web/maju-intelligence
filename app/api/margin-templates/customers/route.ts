import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "../../../../lib/store";
import { marginTemplateGate } from "../../../../lib/pricing/margin-template-gate";
export const dynamic = "force-dynamic";

// CC-19c: 거래처에 마진 템플릿 지정(없으면 기본). 대표·관리자만.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const g = await marginTemplateGate(request, request.nextUrl.searchParams.get("companyId") || undefined, true);
  if ("error" in g) return g.error;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60).replace(/[%*,()]/g, " ");
  try {
    const rows = await supabaseRequest<Array<{ id: string; customer_name: string; margin_template_id: string | null }>>(`normalized_customers?select=id,customer_name,margin_template_id&company_id=eq.${g.companyId}${q ? `&customer_name=ilike.*${encodeURIComponent(q)}*` : ""}&order=customer_name&limit=20`);
    return NextResponse.json({ customers: rows.map((r) => ({ id: r.id, name: r.customer_name, templateId: r.margin_template_id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "거래처를 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; customerId?: string; templateId?: string | null } | null;
  const g = await marginTemplateGate(request, body?.companyId, true);
  if ("error" in g) return g.error;
  const templateId = body?.templateId ?? null;
  if (!body?.customerId || !UUID.test(body.customerId) || (templateId !== null && !UUID.test(templateId))) return NextResponse.json({ message: "거래처와 템플릿을 확인해 주세요." }, { status: 400 });
  try {
    if (templateId) {
      const found = await supabaseRequest<Array<{ id: string }>>(`margin_templates?select=id&id=eq.${templateId}&company_id=eq.${g.companyId}&archived_at=is.null`);
      if (!found.length) return NextResponse.json({ message: "보관됐거나 없는 템플릿입니다." }, { status: 409 });
    }
    const updated = await supabaseRequest<Array<{ id: string }>>(`normalized_customers?select=id&id=eq.${body.customerId}&company_id=eq.${g.companyId}`, { method: "PATCH", body: JSON.stringify({ margin_template_id: templateId }) });
    if (!updated.length) return NextResponse.json({ message: "거래처를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("margin template assign failed", error);
    return NextResponse.json({ message: "템플릿을 지정하지 못했습니다. 다시 시도해 주세요." }, { status: 409 });
  }
}
