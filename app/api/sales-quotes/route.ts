import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { createSalesQuote, type CreateSalesQuoteInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Omit<CreateSalesQuoteInput, "companyId" | "createdByName"> | null;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "견적서를 발행할 권한이 없습니다." }, { status: 403 });
  if (!body?.items?.length || body.items.length > 100) return NextResponse.json({ message: "견적 품목은 1~100개여야 합니다." }, { status: 400 });
  if (!body.leadId && !body.customerId) return NextResponse.json({ message: "리드 또는 거래처가 필요합니다." }, { status: 400 });
  if (!Number.isFinite(body.defaultMarginPercent) || body.defaultMarginPercent < 0 || body.defaultMarginPercent > 90) return NextResponse.json({ message: "마진율을 확인해주세요." }, { status: 400 });
  const validUntil = new Date(body.validUntil);
  if (Number.isNaN(validUntil.getTime()) || validUntil <= new Date()) return NextResponse.json({ message: "유효기간은 현재 이후여야 합니다." }, { status: 400 });
  try {
    const quote = await createSalesQuote({
      ...body,
      companyId: scope.companyId!,
      createdByName: getCustomerOperationalName(scope.customerSession) || scope.adminSession?.name
    });
    const origin = request.nextUrl.origin;
    return NextResponse.json({ ...quote, publicUrl: `${origin}/quote/${quote.publicToken}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "견적서를 저장하지 못했습니다.";
    return NextResponse.json({ message }, { status: /SQL|원장/.test(message) ? 503 : 500 });
  }
}
