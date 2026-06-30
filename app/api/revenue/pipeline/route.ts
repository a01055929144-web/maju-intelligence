import { NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getRevenuePipeline } from "@/lib/store";

export async function GET() {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    pipeline: await getRevenuePipeline(customerSession?.companyId)
  });
}

