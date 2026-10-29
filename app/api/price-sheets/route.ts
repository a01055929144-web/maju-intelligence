import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "../../../lib/auth";
import { priceSheetsEnabled } from "../../../lib/pricing/feature";
import { areHoldModulesEnabled } from "../../../lib/feature-modules";
import { managePriceSheets, type PricingCommand } from "../../../application/pricing/manage-price-sheets";
import { priceSheetRepository } from "../../../lib/pricing/price-sheet-repository";
export const dynamic = "force-dynamic";
const pricing = managePriceSheets(priceSheetRepository);
async function handle(request: NextRequest, write: boolean) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scope.companyId || !areHoldModulesEnabled(scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (scope.customerSession && scope.customerSession.role !== "owner") return NextResponse.json({ message: "대표자 권한이 필요합니다." }, { status: 403 });
  try {
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    const search = (request.nextUrl.searchParams.get("q") || "").trim();
    if (!Number.isInteger(page) || page < 1 || page > 100000 || search.length > 100) return NextResponse.json({ message: "검색 조건을 확인해 주세요." }, { status: 400 });
    if (write) {
      const command: unknown = await request.json();
      if (!command || typeof command !== "object" || !("action" in command) || !["group", "category", "defaults", "item-margin", "assign", "direct", "recalculate", "restore"].includes(String(command.action))) return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
      await pricing.execute(scope.companyId, command as PricingCommand);
    }
    return NextResponse.json(await pricing.read(scope.companyId, { search, page }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pricing P0 request failed", error);
    return NextResponse.json({ message: "가격표 처리에 실패했습니다. 입력값을 확인하고 새로고침 후 다시 시도해 주세요." }, { status: write ? 409 : 500 });
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
