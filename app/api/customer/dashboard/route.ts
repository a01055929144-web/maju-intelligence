import { NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getCompanyDashboardPayload } from "@/lib/store";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!customerHasCapability(session, "view_company_operations")) {
    return NextResponse.json({ message: "회사 전체 운영 현황은 대표 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  return NextResponse.json({
    session,
    dashboard: await getCompanyDashboardPayload(session.companyId)
  });
}

