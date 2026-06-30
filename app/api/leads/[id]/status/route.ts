import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { LeadStatus, updateLeadStatus } from "@/lib/store";

const allowedStatuses: LeadStatus[] = ["today", "reviewing", "visit-planned", "high-probability", "excluded", "this-week"];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { status?: LeadStatus } | null;
  const status = body?.status;

  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const result = await updateLeadStatus(params.id, status, customerSession?.companyId);
  return NextResponse.json({ ok: true, result });
}

