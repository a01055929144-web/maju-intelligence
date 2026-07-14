import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { LeadStatus, updateLeadStatus } from "@/lib/store";

const allowedStatuses: LeadStatus[] = ["today", "reviewing", "visit-planned", "high-probability", "excluded", "this-week"];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; status?: LeadStatus } | null;
  const scope = getRequestAuthScope(request, body?.companyId);
  const status = body?.status;

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const result = await updateLeadStatus(params.id, status, scope.companyId);
  return NextResponse.json({ ok: true, result });
}
