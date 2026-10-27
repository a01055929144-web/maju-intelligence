import { NextRequest, NextResponse } from "next/server";
import { normalizeDoNotContactValue } from "@/domains/lead/outreach-governance";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isActiveLegacyOwnerSession, LEAD_DNC_WRITE_ENABLED, registerLeadDoNotContact, releaseLeadDoNotContact } from "@/lib/store";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json().catch(() => null)) as { channel?: "sms" | "instagram" | "talktalk" | "email" | "fax" | "visit"; reason?: string; value?: string } | null;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "연락 거부를 등록할 권한이 없습니다." }, { status: 403 });
  // RPC는 service_role 전용이라 DB가 세션을 직접 볼 수 없다. NULL actor는 이 서버 경계에서
  // 인증된 legacy owner 또는 MAJU 관리자일 때만 전달될 수 있다.
  if (!scope.customerSession?.userId && !scope.adminSession && scope.customerSession?.workspaceRole !== "owner") {
    return NextResponse.json({ message: "연락 거부를 등록할 권한이 없습니다." }, { status: 403 });
  }
  if (!LEAD_DNC_WRITE_ENABLED) return NextResponse.json({ message: "연락 거부 저장은 검토 중이며 아직 활성화되지 않았습니다." }, { status: 503 });
  const channel = body?.channel;
  if (!channel) return NextResponse.json({ message: "연락 채널이 필요합니다." }, { status: 400 });
  const normalizedValue = normalizeDoNotContactValue(channel, body?.value);
  if (!normalizedValue) return NextResponse.json({ message: "연락처 값이 필요합니다." }, { status: 400 });
  const ok = await registerLeadDoNotContact({
    actorName: getCustomerOperationalName(scope.customerSession) || scope.customerSession?.name || scope.adminSession?.name,
    actorUserId: scope.customerSession?.userId,
    channel,
    companyId: scope.companyId!,
    leadId: (await params).id,
    normalizedValue,
    reason: body?.reason
  });
  return NextResponse.json({ ok });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { dncId?: string; releaseReason?: string } | null;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.customerSession) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!["owner", "manager"].includes(scope.customerSession.workspaceRole)) {
    return NextResponse.json({ message: "연락 거부를 해제할 권한이 없습니다." }, { status: 403 });
  }
  if (!scope.customerSession.userId && scope.customerSession.workspaceRole !== "owner") {
    return NextResponse.json({ message: "legacy owner 세션만 사용자 ID 없이 해제할 수 있습니다." }, { status: 403 });
  }
  if (!scope.customerSession.userId) {
    const activeLegacyOwner = await isActiveLegacyOwnerSession({
      companyId: scope.companyId!,
      email: scope.customerSession.email
    }).catch(() => false);
    if (!activeLegacyOwner) return NextResponse.json({ message: "legacy owner 자격을 확인할 수 없습니다." }, { status: 403 });
  }
  if (!LEAD_DNC_WRITE_ENABLED) return NextResponse.json({ message: "연락 거부 저장은 검토 중이며 아직 활성화되지 않았습니다." }, { status: 503 });
  const dncId = body?.dncId?.trim();
  const releaseReason = body?.releaseReason?.trim();
  if (!dncId) return NextResponse.json({ message: "연락 거부 ID가 필요합니다." }, { status: 400 });
  if (!releaseReason) return NextResponse.json({ message: "해제 사유가 필요합니다." }, { status: 400 });
  const actorKind = scope.customerSession.userId ? "app_user" : "legacy_owner";
  const ok = await releaseLeadDoNotContact({
    actorKind,
    actorName: getCustomerOperationalName(scope.customerSession) || scope.customerSession.name,
    actorUserId: scope.customerSession.userId,
    companyId: scope.companyId!,
    dncId,
    releaseReason
  });
  return NextResponse.json({ ok });
}
