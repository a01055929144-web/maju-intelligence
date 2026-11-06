import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { buildProductFieldPatch, type ProductFieldEdit } from "@/domains/pricing/purchase-receipt";
import { supabaseRequest } from "@/lib/store";
import { runLimited } from "@/lib/run-limited";

export const dynamic = "force-dynamic";

/** 11/4: 매입가 화면 표에서 품목·규격·단위·과세를 바로 고칩니다(상품관리와 같은 상품 원장). */
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ({ companyId?: string; id?: string; items?: Array<{ id?: string } & ProductFieldEdit> } & ProductFieldEdit) | null;
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(auth, "manage_sales")) return NextResponse.json({ message: "상품 원장을 관리할 권한이 없습니다." }, { status: 403 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  // 11/4: 여러 상품을 한 번에(저장 속도). items 가 없으면 한 건.
  const items = (Array.isArray(body?.items) ? body!.items : [body]).filter(Boolean).slice(0, 1000) as Array<{ id?: string } & ProductFieldEdit>;
  const companyId = auth.companyId;
  const results = await runLimited(items, 10, async (item) => {
    if (!item.id || !/^[0-9a-f-]{36}$/i.test(item.id)) return "상품을 찾을 수 없습니다.";
    const patch = buildProductFieldPatch(item);
    if ("error" in patch) return patch.error;
    const rows = await supabaseRequest<Array<{ id: string }>>(
      `product_catalog?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(item.id)}&select=id`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch.values, updated_at: new Date().toISOString() }) }
    ).catch(() => []);
    return rows.length ? "" : "저장하지 못했습니다.";
  });
  const failed = results.filter(Boolean);
  if (items.length === 1 && failed.length) return NextResponse.json({ message: failed[0] }, { status: 400 });
  return NextResponse.json({ ok: !failed.length, saved: results.length - failed.length, failed: failed.length });
}
