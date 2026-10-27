import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { authorizeSensitiveAccessLogRead, normalizeSensitiveAccessItem, normalizeSensitiveAccessWarning } from "@/domains/organization/sensitive-access-log";
import { hideSensitiveAccessLog, isActiveSensitiveAccessOwner, listSensitiveAccessLogs, sensitiveAccessLogsEnabled } from "@/lib/store/07-sensitive-access-logs";

export const dynamic = "force-dynamic";

async function requireOwner() {
  const session = await getCustomerSession();
  const decision = authorizeSensitiveAccessLogRead({
    hasActiveCustomerSession: Boolean(session),
    isActiveCompanyOwner: session ? await isActiveSensitiveAccessOwner({ companyId: session.companyId, isLegacyOwner: !session.userId && session.workspaceRole === "owner", userId: session.userId }) : false
  });
  return { decision, session };
}

export async function GET(request: NextRequest) {
  const { decision, session } = await requireOwner();
  if (decision === "unauthorized" || !session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (decision === "forbidden") return NextResponse.json({ message: "민감정보 열람 기록은 회사 대표만 볼 수 있습니다." }, { status: 403 });
  if (!sensitiveAccessLogsEnabled()) return NextResponse.json({ message: "N3 SQL 승인·적용 전에는 열람 기록을 조회할 수 없습니다." }, { status: 503 });

  const params = request.nextUrl.searchParams;
  const records = await listSensitiveAccessLogs(session.companyId, {
    from: params.get("from") || undefined,
    includeHidden: params.get("includeHidden") === "true",
    item: normalizeSensitiveAccessItem(params.get("item")),
    query: params.get("query")?.trim() || undefined,
    role: params.get("role")?.trim() || undefined,
    to: params.get("to") || undefined,
    userId: params.get("userId") || undefined,
    warning: normalizeSensitiveAccessWarning(params.get("warning"))
  });
  return NextResponse.json({ records });
}

export async function PATCH(request: NextRequest) {
  const { decision, session } = await requireOwner();
  if (decision === "unauthorized" || !session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (decision === "forbidden") return NextResponse.json({ message: "민감정보 열람 기록은 회사 대표만 숨길 수 있습니다." }, { status: 403 });
  if (!sensitiveAccessLogsEnabled()) return NextResponse.json({ message: "N3 SQL 승인·적용 전에는 기록을 변경할 수 없습니다." }, { status: 503 });
  const body = await request.json().catch(() => null) as { logId?: string } | null;
  if (!body?.logId) return NextResponse.json({ message: "숨길 기록 ID가 필요합니다." }, { status: 400 });
  const hiddenAt = await hideSensitiveAccessLog({ actorName: session.operationalDisplayName || session.name, actorUserId: session.userId, companyId: session.companyId, logId: body.logId });
  if (!hiddenAt) return NextResponse.json({ message: "숨길 기록을 찾을 수 없거나 이미 숨김 처리됐습니다." }, { status: 404 });
  return NextResponse.json({ hiddenAt });
}
