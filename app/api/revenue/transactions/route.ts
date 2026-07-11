import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getSalesTransactions } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const adminCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const companyId = customerSession?.companyId || adminCompanyId;

  return NextResponse.json({
    companyId,
    sales: await getSalesTransactions(companyId)
  });
}
