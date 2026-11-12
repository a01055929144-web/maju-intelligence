import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { setStorePrice, StorePriceError } from "@/lib/pricing/store-price-agreement";
import { closeCustomerContractPrice, listCustomerContractPrices, listPendingAcceptedQuotesForCustomer } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "계약 단가를 조회할 권한이 없습니다." }, { status: 403 });
  const { id } = await params;
  const [agreements, pendingQuotes] = await Promise.all([
    listCustomerContractPrices(scope.companyId!, id),
    listPendingAcceptedQuotesForCustomer(scope.companyId!, id)
  ]);
  return NextResponse.json({ agreements, pendingQuotes });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "계약 단가를 종료할 권한이 없습니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { agreementId?: string; mode?: "cancel" | "end" } | null;
  if (!body?.agreementId || !["cancel", "end"].includes(body.mode || "")) return NextResponse.json({ message: "처리할 계약 단가를 확인해 주세요." }, { status: 400 });
  const { id } = await params;
  const agreements = await listCustomerContractPrices(scope.companyId!, id);
  if (!agreements.some((item) => item.id === body.agreementId)) return NextResponse.json({ message: "이 거래처의 계약 단가가 아닙니다." }, { status: 404 });
  await closeCustomerContractPrice(scope.companyId!, body.agreementId, getCustomerOperationalName(scope.customerSession) || scope.adminSession?.name, body.mode!);
  return NextResponse.json({ ok: true });
}

/** CC-30b: 이 매장의 한 상품 가격 정하기(price 숫자) / 끝내기(price null). 대표·관리자만. body: { productId, price }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales") || (scope.customerSession && !canManagePriceSheets(scope.customerSession))) return NextResponse.json({ message: "대표·관리자만 매장 가격을 정할 수 있습니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { productId?: unknown; price?: unknown } | null;
  if (typeof body?.productId !== "string" || !(body.price === null || typeof body.price === "number")) return NextResponse.json({ message: "상품과 가격을 확인해 주세요." }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await setStorePrice(scope.companyId!, id, body.productId, body.price, getCustomerOperationalName(scope.customerSession) || scope.adminSession?.name));
  } catch (error) {
    if (error instanceof StorePriceError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("store price failed", error);
    return NextResponse.json({ message: "매장 가격을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
