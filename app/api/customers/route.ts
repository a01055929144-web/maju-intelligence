import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { CustomerMasterInput, getCustomerMaster, upsertCustomerMaster } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const adminCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const result = await getCustomerMaster(customerSession?.companyId || adminCompanyId);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as (CustomerMasterInput & { companyId?: string }) | null;
  if (!body?.customerName) {
    return NextResponse.json({ message: "거래처명은 필수입니다." }, { status: 400 });
  }

  const adminCompanyId = request.nextUrl.searchParams.get("companyId") || body.companyId;
  const result = await upsertCustomerMaster(body, customerSession?.companyId || adminCompanyId);
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
