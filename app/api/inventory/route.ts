import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { createAndPostStocktake, listInventory, listInventoryIssues, listInventoryMovements, listUnitConversions, saveUnitConversion } from "@/lib/inventory";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "재고를 조회할 권한이 없습니다." }, { status: 403 });
  const mode = request.nextUrl.searchParams.get("mode") || "balances";
  const productId = request.nextUrl.searchParams.get("productId") || undefined;
  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    if (mode === "movements" && productId) return NextResponse.json({ movements: await listInventoryMovements(scope.companyId!, productId) });
    if (mode === "conversions") return NextResponse.json(await listUnitConversions(scope.companyId!, { search, productId }));
    if (mode === "issues") return NextResponse.json(await listInventoryIssues(scope.companyId!, Number(request.nextUrl.searchParams.get("page") || 0)));
    const filter = request.nextUrl.searchParams.get("filter");
    return NextResponse.json(await listInventory(scope.companyId!, {
      cursor: request.nextUrl.searchParams.get("cursor") || undefined,
      search,
      filter: filter === "negative" || filter === "in_stock" || filter === "tracked" ? filter : "all",
    }));
  } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "재고를 불러오지 못했습니다." }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as (({ action: "conversion"; id?: string; productId: string; unitName: string; baseQuantity: number; isBase: boolean; isConfirmed: boolean } | { action: "stocktake"; countedOn: string; reason: string; lines: Array<{ productId: string; countedQuantity: number }> }) & { companyId?: string }) | null;
  const scope = await getRequestAuthScope(request, body?.companyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "재고를 관리할 권한이 없습니다." }, { status: 403 });
  if (!body) return NextResponse.json({ message: "입력값을 확인해 주세요." }, { status: 400 });
  const actor = scope.customerSession?.name || scope.adminSession?.name || "운영자";
  try { if (body.action === "conversion") { await saveUnitConversion(scope.companyId!, body, actor); return NextResponse.json({ ok: true }); } return NextResponse.json({ stocktake: await createAndPostStocktake(scope.companyId!, body, actor) }); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "저장하지 못했습니다." }, { status: 400 }); }
}
