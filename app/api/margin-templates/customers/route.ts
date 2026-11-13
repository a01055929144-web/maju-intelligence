import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "../../../../lib/store";
import { marginTemplateGate } from "../../../../lib/pricing/margin-template-gate";
import { isFeatureEnabled } from "../../../../lib/feature-flags";
export const dynamic = "force-dynamic";

// CC-19c: 거래처에 마진 템플릿 지정(없으면 기본). 대표·관리자만.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const g = await marginTemplateGate(request, request.nextUrl.searchParams.get("companyId") || undefined, true);
  if ("error" in g) return g.error;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60).replace(/[%*,()]/g, " ");
  // CC-32b: all=1이면 매장 전체(2천 곳까지) — 매장 연결 표용. 매장 등급은 스위치(STORE_GRADES)를 켠 회사만 함께 준다.
  if (request.nextUrl.searchParams.get("all") === "1") {
    try {
      const withGrade = isFeatureEnabled("STORE_GRADES", g.companyId);
      const all = await supabaseRequest<Array<{ id: string; customer_name: string; margin_template_id: string | null; store_grade_id?: string | null }>>(`normalized_customers?select=id,customer_name,margin_template_id${withGrade ? ",store_grade_id" : ""}&company_id=eq.${g.companyId}&order=customer_name&limit=2000`);
      return NextResponse.json({ customers: all.map((r) => ({ id: r.id, name: r.customer_name, templateId: r.margin_template_id, gradeId: r.store_grade_id ?? null })) }, { headers: { "Cache-Control": "no-store" } });
    } catch { return NextResponse.json({ message: "거래처를 불러오지 못했습니다." }, { status: 500 }); }
  }
  try {
    const rows = await supabaseRequest<Array<{ id: string; customer_name: string; margin_template_id: string | null }>>(`normalized_customers?select=id,customer_name,margin_template_id&company_id=eq.${g.companyId}${q ? `&customer_name=ilike.*${encodeURIComponent(q)}*` : ""}&order=customer_name&limit=20`);
    return NextResponse.json({ customers: rows.map((r) => ({ id: r.id, name: r.customer_name, templateId: r.margin_template_id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "거래처를 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; customerId?: string; customerIds?: string[]; templateId?: string | null } | null;
  const g = await marginTemplateGate(request, body?.companyId, true);
  if ("error" in g) return g.error;
  const templateId = body?.templateId ?? null;
  // 한 명(customerId) 또는 여러 명(customerIds, 한 번에 100곳까지 — 화면이 100곳씩 나눠 보낸다).
  const ids = body?.customerIds ?? (body?.customerId ? [body.customerId] : []);
  if (!ids.length || ids.length > 100 || ids.some((id) => typeof id !== "string" || !UUID.test(id)) || (templateId !== null && !UUID.test(templateId))) return NextResponse.json({ message: "거래처와 템플릿을 확인해 주세요." }, { status: 400 });
  try {
    if (templateId) {
      const found = await supabaseRequest<Array<{ id: string }>>(`margin_templates?select=id&id=eq.${templateId}&company_id=eq.${g.companyId}&archived_at=is.null`);
      if (!found.length) return NextResponse.json({ message: "보관됐거나 없는 템플릿입니다." }, { status: 409 });
    }
    const updated = await supabaseRequest<Array<{ id: string }>>(`normalized_customers?select=id&id=in.(${ids.join(",")})&company_id=eq.${g.companyId}`, { method: "PATCH", body: JSON.stringify({ margin_template_id: templateId }) });
    if (!updated.length) return NextResponse.json({ message: "거래처를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, updated: updated.length });
  } catch (error) {
    console.error("margin template assign failed", error);
    return NextResponse.json({ message: "템플릿을 지정하지 못했습니다. 다시 시도해 주세요." }, { status: 409 });
  }
}
