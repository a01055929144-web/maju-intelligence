import { NextRequest, NextResponse } from "next/server";
import { SALES_OUTREACH_POLICY_VERSION } from "@/domains/lead/outreach-governance";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { acknowledgeSalesOutreachPolicy, hasSalesOutreachPolicyAcknowledgement, isProductionStoreConfigured } from "@/lib/store";

function resolveActor(scope: Awaited<ReturnType<typeof getRequestAuthScope>>) {
  const session = scope.ok ? scope.customerSession : null;
  if (!session || !scope.companyId) return null;
  return session.userId
    ? { actorKind: "app_user" as const, actorSubject: `app_user:${session.userId}`, userId: session.userId }
    : { actorKind: "legacy_owner" as const, actorSubject: `legacy_owner:${scope.companyId}`, userId: undefined };
}

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isProductionStoreConfigured()) return NextResponse.json({ acknowledged: true, policyVersion: SALES_OUTREACH_POLICY_VERSION });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ acknowledged: true, policyVersion: SALES_OUTREACH_POLICY_VERSION });
  const identity = resolveActor(scope);
  if (!identity) return NextResponse.json({ acknowledged: true, policyVersion: SALES_OUTREACH_POLICY_VERSION });
  const acknowledged = await hasSalesOutreachPolicyAcknowledgement(scope.companyId!, identity.actorSubject, SALES_OUTREACH_POLICY_VERSION);
  return NextResponse.json({ acknowledged, policyVersion: SALES_OUTREACH_POLICY_VERSION });
}

export async function POST(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "영업 수칙을 확인할 권한이 없습니다." }, { status: 403 });
  const identity = resolveActor(scope);
  if (!identity || !scope.customerSession) return NextResponse.json({ message: "고객사 사용자 세션이 필요합니다." }, { status: 403 });
  const acknowledged = await acknowledgeSalesOutreachPolicy({
    ...identity,
    companyId: scope.companyId!,
    policyVersion: SALES_OUTREACH_POLICY_VERSION,
    roleAtAck: scope.customerSession.workspaceRole,
    surface: request.headers.get("x-maju-surface") === "mobile" ? "mobile" : "pc"
  });
  return acknowledged
    ? NextResponse.json({ acknowledged: true, policyVersion: SALES_OUTREACH_POLICY_VERSION })
    : NextResponse.json({ message: "영업 수칙 확인을 저장하지 못했습니다." }, { status: 503 });
}
