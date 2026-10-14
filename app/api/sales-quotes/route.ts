import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { createSalesQuote, type CreateSalesQuoteInput } from "@/lib/store";
import { resolveQuoteValidUntil, validateSalesQuoteInput } from "@/domains/quote/quote";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Omit<CreateSalesQuoteInput, "companyId" | "createdByName"> | null;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "견적서를 발행할 권한이 없습니다." }, { status: 403 });
  if (!body) return NextResponse.json({ message: "견적 정보를 확인해 주세요." }, { status: 400 });
  const fieldErrors = validateSalesQuoteInput(body);
  if (Object.keys(fieldErrors).length) return NextResponse.json({ fieldErrors, message: Object.values(fieldErrors)[0] }, { status: 400 });
  try {
    const quote = await createSalesQuote({
      ...body,
      validUntil: body.status === "draft" && Number.isNaN(new Date(body.validUntil).getTime()) ? resolveQuoteValidUntil(14) : body.validUntil,
      companyId: scope.companyId!,
      createdByName: getCustomerOperationalName(scope.customerSession) || scope.adminSession?.name
    });
    const origin = request.nextUrl.origin;
    return NextResponse.json({ ...quote, publicUrl: body.status === "draft" ? undefined : `${origin}/quote/${quote.publicToken}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "견적서를 저장하지 못했습니다.";
    return NextResponse.json({ message }, { status: /SQL|원장/.test(message) ? 503 : 500 });
  }
}
