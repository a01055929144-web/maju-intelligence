import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import {
  createProductCatalogForAdmin,
  listProductCatalogForAdmin,
  updateProductCatalogForAdmin,
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
    | ({ companyId?: string; id?: string } & Partial<SaveProductCatalogInput>)
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
