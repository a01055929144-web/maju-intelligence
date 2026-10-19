import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { parseLeadBusinessHoursQuickInput } from "@/domains/lead/business-hours";
import { saveLeadBusinessHours } from "@/lib/store";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { quickInput?: string } | null;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) return NextResponse.json({ message: "영업시간을 수정할 권한이 없습니다." }, { status: 403 });
  try {
    const intervals = parseLeadBusinessHoursQuickInput(body?.quickInput || "");
    await saveLeadBusinessHours(scope.companyId!, id, intervals, {
      userId: scope.customerSession?.userId,
      name: getCustomerOperationalName(scope.customerSession) || scope.adminSession?.name
    });
    return NextResponse.json({ intervals });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "영업시간을 저장하지 못했습니다." }, { status: 400 });
  }
}
