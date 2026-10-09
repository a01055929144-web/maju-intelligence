import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { listProductCatalogForAdmin, updateProductCatalogForAdmin, type UpdateProductCatalogInput } from "@/lib/product-catalog-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "상품 원장을 조회할 권한이 없습니다." }, { status: 403 });
  try {
    const items = await listProductCatalogForAdmin(scope.companyId!, request.nextUrl.searchParams.get("q") || "");
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "상품 원장을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ({ companyId?: string; id?: string } & Partial<UpdateProductCatalogInput>) | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "상품 원장을 수정할 권한이 없습니다." }, { status: 403 });
  if (!body?.id || !body.name || !body.unit || !body.matchStatus || body.purchasePrice == null) {
    return NextResponse.json({ message: "필수 상품 정보가 누락되었습니다." }, { status: 400 });
  }
  try {
    const item = await updateProductCatalogForAdmin(scope.companyId!, body.id, {
      matchStatus: body.matchStatus,
      name: body.name,
      purchasePrice: Number(body.purchasePrice),
      salesName: body.salesName,
      salesPrice: body.salesPrice == null ? undefined : Number(body.salesPrice),
      salesSpec: body.salesSpec,
      salesUnit: body.salesUnit,
      spec: body.spec,
      unit: body.unit
    });
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상품 원장을 수정하지 못했습니다.";
    return NextResponse.json({ message }, { status: /필수|이상|필요/.test(message) ? 400 : 500 });
  }
}
