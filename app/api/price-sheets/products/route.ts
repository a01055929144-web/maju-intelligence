import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { buildProductFieldPatch, type ProductFieldEdit } from "@/domains/pricing/purchase-receipt";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 11/4: 매입가 화면 표에서 품목·규격·단위·과세를 바로 고칩니다(상품관리와 같은 상품 원장). */
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ({ companyId?: string; id?: string } & ProductFieldEdit) | null;
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ message: "상품을 찾을 수 없습니다." }, { status: 400 });
  const patch = buildProductFieldPatch(body);
  if ("error" in patch) return NextResponse.json({ message: patch.error }, { status: 400 });
  const rows = await supabaseRequest<Array<{ id: string }>>(
    `product_catalog?company_id=eq.${encodeURIComponent(auth.companyId)}&id=eq.${encodeURIComponent(body.id)}&select=id`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch.values, updated_at: new Date().toISOString() }) }
  ).catch(() => []);
  if (!rows.length) return NextResponse.json({ message: "저장하지 못했습니다." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
