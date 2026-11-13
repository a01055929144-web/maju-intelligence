import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "../../../lib/store";
import { promotionAudienceGate } from "../../../lib/pricing/promotion-audience-gate";
import { isFeatureEnabled } from "../../../lib/feature-flags";
import { parseAudienceRequest, type Audience } from "../../../domains/pricing/promotion-audience";
export const dynamic = "force-dynamic";

// CC-30c: 행사 노출 대상 조회·저장. 판정은 DB, 저장은 save_promotion_audience_v1(한 트랜잭션). 스위치 PROMOTION_AUDIENCE(기본 OFF).
type PromoRow = { id: string; audience: Audience };
type TargetRow = { promotion_id: string; customer_id: string | null; template_id: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 제한된 행사의 대상 요약. promotionId를 주면 그 행사의 선택값, q를 주면 매장 검색 결과도 준다. */
export async function GET(request: NextRequest) {
  const g = await promotionAudienceGate(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in g) return g.error;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60).replace(/[%*,()]/g, " ");
  const promotionId = request.nextUrl.searchParams.get("promotionId");
  if (promotionId && !UUID.test(promotionId)) return NextResponse.json({ message: "행사를 확인해 주세요." }, { status: 400 });
  try {
    const [promos, targets] = await Promise.all([
      supabaseRequest<PromoRow[]>(`pricing_promotions?select=id,audience&company_id=eq.${g.companyId}&audience=neq.all&limit=1000`),
      supabaseRequest<TargetRow[]>(`pricing_promotion_targets?select=promotion_id,customer_id,template_id&company_id=eq.${g.companyId}&limit=5000`),
    ]);
    const summary = promos.map((p) => ({ promotionId: p.id, audience: p.audience, customers: targets.filter((t) => t.promotion_id === p.id && t.customer_id).length, templates: targets.filter((t) => t.promotion_id === p.id && t.template_id).length }));
    const pickedIds = promotionId ? targets.filter((t) => t.promotion_id === promotionId && t.customer_id).map((t) => t.customer_id as string) : [];
    const [found, templates, picked] = await Promise.all([
      q ? supabaseRequest<Array<{ id: string; customer_name: string }>>(`normalized_customers?select=id,customer_name&company_id=eq.${g.companyId}&customer_name=ilike.*${encodeURIComponent(q)}*&order=customer_name&limit=30`) : Promise.resolve([]),
      isFeatureEnabled("MARGIN_TEMPLATES", g.companyId) ? supabaseRequest<Array<{ id: string; name: string }>>(`margin_templates?select=id,name&company_id=eq.${g.companyId}&archived_at=is.null&order=sort_order,name`) : Promise.resolve([]),
      pickedIds.length ? supabaseRequest<Array<{ id: string; customer_name: string }>>(`normalized_customers?select=id,customer_name&company_id=eq.${g.companyId}&id=in.(${pickedIds.join(",")})`) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      summary,
      templates,
      customers: found.map((c) => ({ id: c.id, name: c.customer_name })),
      selected: promotionId ? { customers: picked.map((c) => ({ id: c.id, name: c.customer_name })), templateIds: targets.filter((t) => t.promotion_id === promotionId && t.template_id).map((t) => t.template_id as string) } : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "노출 대상을 불러오지 못했습니다." }, { status: 500 }); }
}

/** body: { companyId, promotionId, expected(행사 revision), audience, targets: [{kind, id}] } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string } | null;
  const g = await promotionAudienceGate(request, body?.companyId);
  if ("error" in g) return g.error;
  const input = parseAudienceRequest(body);
  if (!input) return NextResponse.json({ message: "노출 대상을 확인해 주세요. 특정 매장만 노출하려면 대상을 하나 이상 골라야 합니다." }, { status: 400 });
  try {
    const result = await supabaseRequest<{ revision: number; audience: Audience; targets: number }>("rpc/save_promotion_audience_v1", { method: "POST", body: JSON.stringify({ p_company: g.companyId, p_promotion: input.promotionId, p_expected_revision: input.expected, p_audience: input.audience, p_targets: input.targets }) });
    return NextResponse.json(result);
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (/Stale promotion/.test(text)) return NextResponse.json({ message: "다른 곳에서 먼저 바뀐 행사입니다. 새로 고친 뒤 다시 시도해 주세요." }, { status: 409 });
    if (/outside company|Promotion not found/.test(text)) return NextResponse.json({ message: "대상 매장·등급을 확인해 주세요." }, { status: 400 });
    console.error("promotion audience save failed", error);
    return NextResponse.json({ message: "노출 대상을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 409 });
  }
}
