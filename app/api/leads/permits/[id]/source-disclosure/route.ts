import { NextRequest, NextResponse } from "next/server";
import { resolveLeadContactActorName } from "@/domains/lead/lead-action";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { recordLeadSourceDisclosureAudit } from "@/lib/store";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "출처 안내를 기록할 권한이 없습니다." }, { status: 403 });

  const ok = await recordLeadSourceDisclosureAudit(scope.companyId!, id, {
    actorName: resolveLeadContactActorName([
      getCustomerOperationalName(scope.customerSession),
      scope.customerSession?.name,
      scope.adminSession?.name
    ]),
    actorUserId: scope.adminSession ? undefined : scope.customerSession?.userId
  });
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ message: "리드를 찾을 수 없습니다." }, { status: 404 });
}
