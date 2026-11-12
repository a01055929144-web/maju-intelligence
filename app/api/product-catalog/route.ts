import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import {
  createProductCatalogForAdmin,
  deleteProductsForAdmin,
  restoreProductsForAdmin,
  listProductCategorySuggestions,
  listProductCatalogForAdmin,
  updateProductCatalogForAdmin,
  updateProductCategoriesForAdmin,
  type SaveProductCatalogInput,
} from "@/lib/product-catalog-admin";
export const dynamic = "force-dynamic";
type Scope = Awaited<ReturnType<typeof getRequestAuthScope>>;
function denied(scope: Scope) {
  if (!scope.ok)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales"))
    return NextResponse.json(
      { message: "상품 원장을 관리할 권한이 없습니다." },
      { status: 403 },
    );
  return null;
}
function actor(scope: Scope) {
  return {
    userId: scope.ok ? scope.customerSession?.userId : undefined,
    name: scope.ok
      ? scope.customerSession?.name || scope.adminSession?.name || "운영자"
      : "운영자",
  };
}
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(
      request,
      request.nextUrl.searchParams.get("companyId") || undefined,
    ),
    error = denied(scope);
  if (error) return error;
  try {
    if (request.nextUrl.searchParams.get("action") === "category-suggestions") {
      const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
      return NextResponse.json(await listProductCategorySuggestions(scope.companyId!, page));
    }
    return NextResponse.json({
      items: await listProductCatalogForAdmin(
        scope.companyId!,
        request.nextUrl.searchParams.get("q") || "",
      ),
    });
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof Error ? e.message : "상품 원장을 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
async function payload(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | ({ action?: string; companyId?: string; id?: string; ids?: string[]; apply?: boolean; updates?: Array<{ id: string; category: string; expectedCategory: string }> } & Partial<SaveProductCatalogInput>)
    | null;
  return { body, scope: await getRequestAuthScope(request, body?.companyId) };
}
export async function POST(request: NextRequest) {
  const { body, scope } = await payload(request),
    error = denied(scope);
  if (error) return error;
  if (!body?.name)
    return NextResponse.json(
      { message: "품목명을 입력해 주세요." },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      item: await createProductCatalogForAdmin(
        scope.companyId!,
        body as SaveProductCatalogInput,
        actor(scope),
      ),
    });
  } catch (e) {
    return NextResponse.json(
      {
        message: e instanceof Error ? e.message : "품목을 생성하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
export async function PATCH(request: NextRequest) {
  const { body, scope } = await payload(request),
    error = denied(scope);
  if (error) return error;
  if (body?.action === "delete-products" || body?.action === "restore-products") {
    // CC-24: 삭제·숨김·되살리기는 대표·관리자만(직원은 불가). 관리자 미리보기는 세션 없음 = 허용.
    if (scope.ok && scope.customerSession && !canManagePriceSheets(scope.customerSession)) return NextResponse.json({ message: "대표·관리자만 상품을 삭제할 수 있습니다." }, { status: 403 });
    if (!Array.isArray(body.ids)) return NextResponse.json({ message: "상품을 골라 주세요." }, { status: 400 });
    try {
      if (body.action === "restore-products") return NextResponse.json({ restored: await restoreProductsForAdmin(scope.companyId!, body.ids) });
      return NextResponse.json(await deleteProductsForAdmin(scope.companyId!, body.ids, body.apply === true));
    } catch (e) {
      return NextResponse.json({ message: e instanceof Error && /상품을 1~500개/.test(e.message) ? e.message : "상품을 처리하지 못했습니다. 다시 시도해 주세요." }, { status: 400 });
    }
  }
  if (body?.action === "update-categories") {
    if (!Array.isArray(body.updates)) return NextResponse.json({ message: "저장할 추천을 확인해 주세요." }, { status: 400 });
    try {
      const results = await updateProductCategoriesForAdmin(scope.companyId!, body.updates);
      return NextResponse.json({
        results,
        savedCount: results.filter((item) => item.ok).length,
        failedCount: results.filter((item) => !item.ok).length,
      });
    } catch (e) {
      return NextResponse.json({ message: e instanceof Error ? e.message : "추천 분류를 저장하지 못했습니다." }, { status: 400 });
    }
  }
  if (!body?.id || !body.name)
    return NextResponse.json(
      { message: "품목 정보를 확인해 주세요." },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      item: await updateProductCatalogForAdmin(
        scope.companyId!,
        body.id,
        body as SaveProductCatalogInput,
        actor(scope),
      ),
    });
  } catch (e) {
    return NextResponse.json(
      {
        message: e instanceof Error ? e.message : "품목을 수정하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
