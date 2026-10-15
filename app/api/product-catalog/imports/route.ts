import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import {
  createCatalogFromSupplierProducts,
  listProductImportWorkspace,
  saveProductCatalogImport,
} from "@/lib/product-catalog-import";
import type {
  CatalogMapping,
  ParsedProduct,
} from "@/domains/product/catalog-import";

export const dynamic = "force-dynamic";

const MAX_PRODUCTS_PER_IMPORT = 5_000;
const MAX_PRICE = 1_000_000_000;
function validateImportBody(body: {
  fileName?: string;
  supplierName?: string;
  products?: ParsedProduct[];
}) {
  const supplierName = body.supplierName?.trim() || "";
  if (!supplierName || supplierName.length > 120)
    return "유통사명은 1~120자로 입력해 주세요.";
  if (!body.fileName || body.fileName.length > 255)
    return "파일명을 확인해 주세요.";
  if (
    !Array.isArray(body.products) ||
    !body.products.length ||
    body.products.length > MAX_PRODUCTS_PER_IMPORT
  )
    return `한 번에 1~${MAX_PRODUCTS_PER_IMPORT.toLocaleString()}개 품목만 저장할 수 있습니다.`;
  let observationCount = 0;
  for (const product of body.products) {
    if (
      !product.rawName?.trim() ||
      product.rawName.length > 300 ||
      product.name.length > 300
    )
      return "상품명은 1~300자여야 합니다.";
    if (
      [
        product.rawSpec,
        product.rawUnit,
        product.productCode,
        product.barcode,
      ].some((value) => value && value.length > 200)
    )
      return "상품 코드·규격·단위는 200자를 넘을 수 없습니다.";
    if (
      !Number.isFinite(product.cost) ||
      product.cost < 0 ||
      product.cost > MAX_PRICE
    )
      return "원가는 0원 이상 10억원 이하여야 합니다.";
    if (
      [product.salesMin, product.salesMedian].some(
        (value) =>
          value != null &&
          (!Number.isFinite(value) || value < 0 || value > MAX_PRICE),
      )
    )
      return "참고 판매가는 0원 이상 10억원 이하여야 합니다.";
    observationCount += product.observations?.length || 0;
    if (observationCount > 100_000)
      return "가격 관측 행은 한 번에 100,000건을 넘을 수 없습니다.";
    if (
      (product.observations || []).some(
        (item) =>
          !item.buyerName?.trim() ||
          item.buyerName.length > 300 ||
          !Number.isFinite(item.unitPrice) ||
          item.unitPrice < 0 ||
          item.unitPrice > MAX_PRICE,
      )
    )
      return "구매처명 또는 관측 단가를 확인해 주세요.";
  }
  return "";
}

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(
    request,
    request.nextUrl.searchParams.get("companyId") || undefined,
  );
  if (!scope.ok)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales"))
    return NextResponse.json(
      { message: "상품 원장을 조회할 권한이 없습니다." },
      { status: 403 },
    );
  try {
    return NextResponse.json(
      await listProductImportWorkspace(scope.companyId!),
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "유통사 상품을 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as null | {
    action?: string;
    companyId?: string;
    fileName?: string;
    supplierName?: string;
    mapping?: CatalogMapping;
    products?: ParsedProduct[];
    excludedCount?: number;
    warnings?: string[];
    supplierProductIds?: string[];
  };
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales"))
    return NextResponse.json(
      { message: "상품 원장을 수정할 권한이 없습니다." },
      { status: 403 },
    );
  try {
    if (body?.action === "create-standards")
      return NextResponse.json(
        await createCatalogFromSupplierProducts(
          scope.companyId!,
          body.supplierProductIds || [],
        ),
      );
    if (
      body?.action !== "save-import" ||
      !body.fileName ||
      !body.supplierName ||
      !body.mapping ||
      !Array.isArray(body.products)
    )
      return NextResponse.json(
        { message: "업로드 정보를 확인해 주세요." },
        { status: 400 },
      );
    const validationMessage = validateImportBody(body);
    if (validationMessage)
      return NextResponse.json({ message: validationMessage }, { status: 400 });
    const actorName =
      scope.customerSession?.name || scope.adminSession?.name || "운영자";
    return NextResponse.json(
      await saveProductCatalogImport({
        companyId: scope.companyId!,
        createdByName: actorName,
        fileName: body.fileName,
        supplierName: body.supplierName,
        mapping: body.mapping,
        products: body.products,
        excludedCount: Number(body.excludedCount) || 0,
        warnings: Array.isArray(body.warnings) ? body.warnings : [],
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "상품 업로드를 저장하지 못했습니다.";
    return NextResponse.json(
      { message },
      { status: /입력|선택|없습니다/.test(message) ? 400 : 500 },
    );
  }
}
