import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getUploadHistory } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();
  const adminCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const companyId = customerSession?.companyId || (adminSession ? adminCompanyId : undefined);

  const uploads = await getUploadHistory(companyId);
  return NextResponse.json({
    companyId,
    uploads
  });
}
