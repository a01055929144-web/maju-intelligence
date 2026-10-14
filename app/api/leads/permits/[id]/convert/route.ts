import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { convertPermitLeadToCustomer, getPermitLeadConversionPreview } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) return NextResponse.json({ message: "거래처 전환 정보를 볼 권한이 없습니다." }, { status: 403 });
  try {
    return NextResponse.json(await getPermitLeadConversionPreview(scope.companyId!, id));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "배정 추천을 불러오지 못했습니다." }, { status: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string; assignedStaffMemberId?: string; deliveryTerritoryId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처로 전환할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await convertPermitLeadToCustomer(scope.companyId!, id, {
      actorName: scope.customerSession?.name || scope.adminSession?.name || "시스템",
      actorRole: scope.role,
      requestMethod: request.method
    }, { assignedStaffMemberId: body?.assignedStaffMemberId, deliveryTerritoryId: body?.deliveryTerritoryId });

    if (!result.ok) {
      return NextResponse.json(
        { customerId: result.customerId, existingCustomer: Boolean(result.customerId), message: result.message || "거래처 전환에 실패했습니다." },
        { status: result.customerId ? 409 : 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead convert failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "거래처 전환 중 오류가 발생했습니다." }, { status: 500 });
  }
}
