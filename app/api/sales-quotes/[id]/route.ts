import { NextRequest, NextResponse } from "next/server";
import { resolveQuoteValidUntil, validateSalesQuoteInput } from "@/domains/quote/quote";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getSalesQuoteForEdit, updateSalesQuote, type CreateSalesQuoteInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "견적서를 조회할 권한이 없습니다." }, { status: 403 });
  const { id } = await params;
  const quote = await getSalesQuoteForEdit(scope.companyId!, id);
  if (!quote) return NextResponse.json({ message: "수정할 견적을 찾지 못했습니다." }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "견적서를 수정할 권한이 없습니다." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Omit<CreateSalesQuoteInput, "companyId" | "createdByName"> | null;
  if (!body) return NextResponse.json({ message: "견적 정보를 확인해 주세요." }, { status: 400 });
  const fieldErrors = validateSalesQuoteInput(body);
  if (Object.keys(fieldErrors).length) return NextResponse.json({ fieldErrors, message: Object.values(fieldErrors)[0] }, { status: 400 });
  const { id } = await params;
  try {
    const quote = await updateSalesQuote(scope.companyId!, id, {
      ...body,
      validUntil: body.status === "draft" && Number.isNaN(new Date(body.validUntil).getTime()) ? resolveQuoteValidUntil(14) : body.validUntil
    });
    return NextResponse.json({ ...quote, publicUrl: body.status === "draft" ? undefined : `${request.nextUrl.origin}/quote/${quote.publicToken}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "견적서를 수정하지 못했습니다.";
    return NextResponse.json({ message }, { status: message.includes("이 회사") ? 404 : 500 });
  }
}
