import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "../../../lib/store";
import { marginTemplateGate } from "../../../lib/pricing/margin-template-gate";
export const dynamic = "force-dynamic";

// CC-19b: 마진 템플릿(거래처 등급별 마진) 목록·저장·보관. 스위치 MARGIN_TEMPLATES를 켠 회사의 대표·관리자만.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bp = (percent: number) => Math.round(percent * 100);
type Row = { id: string; name: string; margin_bp: number; rounding: number; sort_order: number };
type CatRow = { template_id: string; category: string; margin_bp: number };

async function list(companyId: string) {
  const [templates, categories, customers] = await Promise.all([
    supabaseRequest<Row[]>(`margin_templates?select=id,name,margin_bp,rounding,sort_order&company_id=eq.${companyId}&archived_at=is.null&order=sort_order,name`),
    supabaseRequest<CatRow[]>(`margin_template_categories?select=template_id,category,margin_bp&company_id=eq.${companyId}`),
    // CC-32b: 카드에 "매장 N". 한 회사 매장이 2만 곳을 넘으면 앞쪽만 센다(shortcut).
    supabaseRequest<Array<{ margin_template_id: string }>>(`normalized_customers?select=margin_template_id&company_id=eq.${companyId}&margin_template_id=not.is.null&limit=20000`).catch(() => []),
  ]);
  const storeCount = new Map<string, number>();
  for (const c of customers) storeCount.set(c.margin_template_id, (storeCount.get(c.margin_template_id) ?? 0) + 1);
  return { templates: templates.map((t) => ({ id: t.id, storeCount: storeCount.get(t.id) ?? 0, name: t.name, margin: t.margin_bp / 100, rounding: t.rounding, categories: categories.filter((c) => c.template_id === t.id).map((c) => ({ category: c.category, margin: c.margin_bp / 100 })) })) };
}

export async function GET(request: NextRequest) {
  const g = await marginTemplateGate(request, request.nextUrl.searchParams.get("companyId") || undefined, false); // 목록은 영업도 본다
  if ("error" in g) return g.error;
  try { return NextResponse.json(await list(g.companyId), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ message: "템플릿을 불러오지 못했습니다." }, { status: 500 }); }
}

/** body: { companyId, action: "save"|"archive", id?, name, margin, rounding, categories: [{category, margin}] } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; action?: string; id?: string; name?: string; margin?: number; rounding?: number; categories?: Array<{ category?: string; margin?: number }> } | null;
  const g = await marginTemplateGate(request, body?.companyId, true); if ("error" in g) return g.error;
  const { companyId } = g;
  try {
    if (body?.action === "archive") {
      if (!body.id || !UUID.test(body.id)) return NextResponse.json({ message: "템플릿을 확인해 주세요." }, { status: 400 });
      const used = await supabaseRequest<Array<{ id: string }>>(`normalized_customers?select=id&company_id=eq.${companyId}&margin_template_id=eq.${body.id}&limit=1`);
      if (used.length) return NextResponse.json({ message: "이 템플릿을 쓰는 거래처가 있어 보관할 수 없습니다. 거래처의 템플릿을 먼저 바꿔 주세요." }, { status: 409 });
      await supabaseRequest(`margin_templates?id=eq.${body.id}&company_id=eq.${companyId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      return NextResponse.json(await list(companyId));
    }
    if (body?.action !== "save") return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
    const name = String(body.name ?? "").trim(), margin = Number(body.margin), rounding = Number(body.rounding);
    const cats = Array.isArray(body.categories) ? body.categories : [];
    const validMargin = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
    if (!name || name.length > 60 || !validMargin(margin) || ![1, 10, 100].includes(rounding) || cats.length > 500
      || cats.some((c) => !c.category?.trim() || c.category.length > 100 || !validMargin(Number(c.margin))) || new Set(cats.map((c) => c.category!.trim())).size !== cats.length || (body.id && !UUID.test(body.id)))
      return NextResponse.json({ message: "이름(60자 이하)·마진(0~1000%, 소수 둘째 자리)·끝자리 올림·분류 값을 확인해 주세요." }, { status: 400 });
    let id = body.id || "";
    if (id) await supabaseRequest(`margin_templates?id=eq.${id}&company_id=eq.${companyId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name, margin_bp: bp(margin), rounding, updated_at: new Date().toISOString() }) });
    else [{ id }] = await supabaseRequest<Array<{ id: string }>>("margin_templates?select=id", { method: "POST", body: JSON.stringify({ company_id: companyId, name, margin_bp: bp(margin), rounding, created_by: g.userId }) });
    // 분류 마진: 먼저 넣고(덮어쓰기) 목록에 없는 것만 지운다 — 중간에 끊겨도 값이 사라지지 않는다.
    if (cats.length) await supabaseRequest("margin_template_categories?on_conflict=template_id,category", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(cats.map((c) => ({ company_id: companyId, template_id: id, category: c.category!.trim(), margin_bp: bp(Number(c.margin)) }))) });
    const keep = cats.map((c) => encodeURIComponent(JSON.stringify(c.category!.trim())));
    await supabaseRequest(`margin_template_categories?company_id=eq.${companyId}&template_id=eq.${id}${keep.length ? `&category=not.in.(${keep.join(",")})` : ""}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return NextResponse.json({ id, ...(await list(companyId)) });
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (/duplicate|23505|unique/i.test(text)) return NextResponse.json({ message: "같은 이름의 템플릿이 있습니다." }, { status: 409 });
    console.error("margin template request failed", error);
    return NextResponse.json({ message: "템플릿을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 409 });
  }
}
