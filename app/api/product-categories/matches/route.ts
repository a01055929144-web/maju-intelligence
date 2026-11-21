import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { listCategoryMatches, saveCategoryMatch } from "@/lib/product-category-match";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function scope(request: NextRequest, companyId?: string) {
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!scopeHasCapability(auth, "manage_sales") || (auth.customerSession && !canManagePriceSheets(auth.customerSession)))
    return { error: NextResponse.json({ message: "대표·관리자만 공통 카테고리를 관리할 수 있습니다." }, { status: 403 }) };
  if (!isFeatureEnabled("COMMON_CATEGORY_MAPPING", auth.companyId)) return { error: NextResponse.json({ message: "공통 카테고리 매핑 기능이 꺼져 있습니다." }, { status: 404 }) };
  return { auth };
}

export async function GET(request: NextRequest) {
  const checked = await scope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (checked.error) return checked.error;
  try {
    return NextResponse.json(await listCategoryMatches(checked.auth!.companyId!));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "카테고리 연결을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as null | { companyId?: string; categoryId?: string; majuCategoryId?: string | null };
  const checked = await scope(request, body?.companyId);
  if (checked.error) return checked.error;
  if (!body?.categoryId || !uuid.test(body.categoryId) || (body.majuCategoryId !== null && !uuid.test(body.majuCategoryId || "")))
    return NextResponse.json({ message: "카테고리 연결값을 확인해 주세요." }, { status: 400 });
  try {
    return NextResponse.json(await saveCategoryMatch(checked.auth!.companyId!, body.categoryId, body.majuCategoryId ?? null));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "카테고리 연결을 저장하지 못했습니다." }, { status: 400 });
  }
}
