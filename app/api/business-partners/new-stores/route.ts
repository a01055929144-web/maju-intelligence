import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { listPendingStoreCustomerReviews } from "@/lib/business-partner-new-stores";
import { StoreReviewError, confirmNewCustomer, linkExistingCustomer, reviewCandidates } from "@/lib/pricing/store-customer-review";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize(request: NextRequest, companyId?: string) {
  const scope = await getRequestAuthScope(request, companyId);
  if (!scope.ok) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!isFeatureEnabled("PARTNER_REGISTRATION", scope.companyId) || !isFeatureEnabled("NEW_STORE_CUSTOMER_REVIEW", scope.companyId))
    return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (!scopeHasCapability(scope, "manage_customers")) return { error: NextResponse.json({ message: "새 매장을 확인할 권한이 없습니다." }, { status: 403 }) };
  return { scope };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ items: await listPendingStoreCustomerReviews(auth.scope.companyId) });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; action?: string; storeAccountId?: string; customerId?: string } | null;
  const auth = await authorize(request, body?.companyId);
  if ("error" in auth) return auth.error;
  if (!body || !uuid.test(body.storeAccountId || "")) return NextResponse.json({ message: "매장을 다시 선택해 주세요." }, { status: 400 });
  const actor = { userId: auth.scope.customerSession?.userId, name: getCustomerOperationalName(auth.scope.customerSession) || "운영자" };
  try {
    if (body.action === "candidates") return NextResponse.json({ candidates: await reviewCandidates(auth.scope.companyId, body.storeAccountId!) });
    if (body.action === "confirm_customer") return NextResponse.json(await confirmNewCustomer(auth.scope.companyId, body.storeAccountId!, actor));
    if (body.action === "link_customer" && uuid.test(body.customerId || "")) return NextResponse.json(await linkExistingCustomer(auth.scope.companyId, body.storeAccountId!, body.customerId!, actor));
    return NextResponse.json({ message: "처리 방법을 확인해 주세요." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof StoreReviewError ? error.message : "새 매장을 처리하지 못했습니다." }, { status: error instanceof StoreReviewError ? error.status : 500 });
  }
}
