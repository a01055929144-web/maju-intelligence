import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { supabaseRequest } from "@/lib/store";
export const dynamic = "force-dynamic";

// CC-24b: 매입가 업로드 "다음에도 제외" 코드 목록(회사별). 대표·관리자만, 회사는 로그인 범위로 고정.
const enc = encodeURIComponent;
type Row = { id: string; code: string; supplier_id: string | null };

async function guard(request: NextRequest, companyId?: string) {
  if (!priceSheetsEnabled()) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  const scope = await getRequestAuthScope(request, companyId);
  if (!scope.ok) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!scope.companyId || !isFeatureEnabled("PRICING", scope.companyId)) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (!scopeHasCapability(scope, "manage_sales")) return { error: NextResponse.json({ message: "마진 설정 권한이 없습니다." }, { status: 403 }) };
  if (scope.customerSession && !canManagePriceSheets(scope.customerSession)) return { error: NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 }) };
  return { companyId: scope.companyId, scope };
}

async function suppliers(companyId: string) {
  return supabaseRequest<Array<{ id: string; name: string }>>(`product_suppliers?select=id,name&company_id=eq.${enc(companyId)}&limit=2000`);
}

export async function GET(request: NextRequest) {
  const checked = await guard(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in checked && checked.error) return checked.error;
  const companyId = checked.companyId!;
  try {
    const [rows, list] = await Promise.all([
      supabaseRequest<Row[]>(`purchase_cost_excluded_codes?select=id,code,supplier_id&company_id=eq.${enc(companyId)}&order=code&limit=5000`),
      suppliers(companyId)
    ]);
    const names = new Map(list.map(item => [item.id, item.name]));
    return NextResponse.json({ items: rows.map(row => ({ id: row.id, code: row.code, supplierName: row.supplier_id ? names.get(row.supplier_id) ?? null : null })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("CC-24b excluded codes list failed", error);
    return NextResponse.json({ message: "제외 코드를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; items?: Array<{ code?: string; supplierName?: string | null }> } | null;
  const checked = await guard(request, body?.companyId);
  if ("error" in checked && checked.error) return checked.error;
  const companyId = checked.companyId!;
  const items = Array.isArray(body?.items) ? body!.items : [];
  if (!items.length || items.length > 200) return NextResponse.json({ message: "제외할 코드는 한 번에 1~200개입니다." }, { status: 400 });
  const wanted = new Map<string, { code: string; supplierName: string }>();
  for (const item of items) {
    const code = String(item.code ?? "").trim(), supplierName = String(item.supplierName ?? "").trim();
    if (!code || code.length > 80) return NextResponse.json({ message: "코드는 1~80자여야 합니다." }, { status: 400 });
    wanted.set(`${supplierName}\u0000${code.toLowerCase()}`, { code, supplierName });
  }
  try {
    const [existing, list] = await Promise.all([
      supabaseRequest<Row[]>(`purchase_cost_excluded_codes?select=id,code,supplier_id&company_id=eq.${enc(companyId)}&limit=5000`),
      suppliers(companyId)
    ]);
    const byName = new Map(list.map(item => [item.name, item.id]));
    const seen = new Set(existing.map(row => `${row.supplier_id ?? ""}\u0000${row.code.toLowerCase()}`));
    const rows: Array<Record<string, unknown>> = [];
    for (const { code, supplierName } of Array.from(wanted.values())) {
      const supplierId = supplierName ? byName.get(supplierName) : null;
      if (supplierName && !supplierId) return NextResponse.json({ message: `매입처 "${supplierName}"를 찾지 못했습니다. "회사 전체"로 제외해 주세요.` }, { status: 400 });
      if (seen.has(`${supplierId ?? ""}\u0000${code.toLowerCase()}`)) continue;
      rows.push({ company_id: companyId, supplier_id: supplierId ?? null, code, created_by_user_id: checked.scope?.customerSession?.userId ?? null });
    }
    if (rows.length) await supabaseRequest("purchase_cost_excluded_codes", { method: "POST", body: JSON.stringify(rows) });
    return NextResponse.json({ added: rows.length });
  } catch (error) {
    // 같은 순간 다른 창이 먼저 넣은 경우(중복 유일 키) — 이미 제외돼 있으니 성공으로 본다.
    if (error instanceof Error && /23505|duplicate key/i.test(error.message)) return NextResponse.json({ added: 0 });
    console.error("CC-24b excluded codes add failed", error);
    return NextResponse.json({ message: "제외 코드를 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  const checked = await guard(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in checked && checked.error) return checked.error;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "지울 코드를 확인해 주세요." }, { status: 400 });
  try {
    await supabaseRequest(`purchase_cost_excluded_codes?id=eq.${enc(id)}&company_id=eq.${enc(checked.companyId!)}`, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("CC-24b excluded codes delete failed", error);
    return NextResponse.json({ message: "제외 코드를 지우지 못했습니다." }, { status: 409 });
  }
}
