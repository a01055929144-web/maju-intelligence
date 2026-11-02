import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { updatePurchaseCosts, type PurchaseCostChange } from "@/application/pricing/update-purchase-cost";
import { purchaseCostRepository } from "@/lib/pricing/purchase-cost-repository";

export const dynamic = "force-dynamic";
const costs = updatePurchaseCosts(purchaseCostRepository);

async function scope(request: NextRequest, companyId?: string) {
  if (!priceSheetsEnabled()) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!auth.companyId || !isFeatureEnabled("PRICING", auth.companyId)) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return { error: NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 }) };
  return { auth };
}

export async function GET(request: NextRequest) {
  const checked = await scope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (checked.error) return checked.error;
  try { return NextResponse.json(await costs.list(checked.auth!.companyId!), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "매입가를 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      const parsed = new URL(origin);
      sameOrigin = ["http:", "https:"].includes(parsed.protocol) &&
        parsed.host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase();
    } catch { /* malformed origins are rejected */ }
    if (!sameOrigin) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { companyId?: string; changes?: PurchaseCostChange[] } | null;
  const checked = await scope(request, body?.companyId);
  if (checked.error) return checked.error;
  try {
    return NextResponse.json(await costs.save(checked.auth!.companyId!, checked.auth!.customerSession?.name || checked.auth!.adminSession?.name || "운영자", body?.changes || []));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "매입가를 저장하지 못했습니다." }, { status: 409 });
  }
}
