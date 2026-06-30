import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { getCompanyDashboardPayload } from "@/lib/store";

export async function GET() {
  const session = getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    session,
    dashboard: await getCompanyDashboardPayload(session.companyId)
  });
}

