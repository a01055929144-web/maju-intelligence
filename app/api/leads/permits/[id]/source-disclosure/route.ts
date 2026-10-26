import { NextRequest, NextResponse } from "next/server";
import { resolveLeadContactActorName } from "@/domains/lead/lead-action";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { listLeadContactFieldSources, recordLeadSourceDisclosureAudit } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "출처를 조회할 권한이 없습니다." }, { status: 403 });
  const rows = await listLeadContactFieldSources(scope.companyId!, (await params).id);
  return NextResponse.json({ sources: rows.map((row) => ({ collectedAt: row.collected_at, fieldName: row.field_name, sourceType: row.source_type })) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "출처 안내를 기록할 권한이 없습니다." }, { status: 403 });

  try {
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
  } catch (error) {
    console.error("lead source disclosure audit write failed:", error);
    return NextResponse.json({ message: "출처 안내 기록을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 503 });
  }
}
