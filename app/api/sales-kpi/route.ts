import { NextResponse } from "next/server";
import { customerHasCapability, getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { getSalesKpiSnapshot, updateCompanySalesKpiTarget } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const kpi = await getSalesKpiSnapshot(session.companyId, session.userId, getCustomerOperationalName(session));
  return NextResponse.json({ kpi });
}

export async function PUT(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!customerHasCapability(session, "manage_company")) return NextResponse.json({ message: "영업 목표를 변경할 권한이 없습니다." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { targetContacts?: number; targetConversions?: number; targetQuotes?: number } | null;
  const values = [body?.targetContacts, body?.targetQuotes, body?.targetConversions];
  if (values.some((value) => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 100000)) return NextResponse.json({ message: "목표값은 0 이상의 정수여야 합니다." }, { status: 400 });
  try {
    const target = await updateCompanySalesKpiTarget(session.companyId, {
      targetContacts: Number(body?.targetContacts),
      targetConversions: Number(body?.targetConversions),
      targetQuotes: Number(body?.targetQuotes)
    });
    return NextResponse.json({ target });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "영업 목표를 저장하지 못했습니다." }, { status: 400 });
  }
}
