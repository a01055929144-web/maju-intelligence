import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
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
