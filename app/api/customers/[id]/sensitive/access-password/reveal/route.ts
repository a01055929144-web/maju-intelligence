import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { revealAccessPasswordForMember, sensitiveAccessLogsEnabled } from "@/lib/store/07-sensitive-access-logs";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, private, max-age=0" };

function deviceLabel(request: NextRequest) {
  const agent = request.headers.get("user-agent") || "알 수 없는 기기";
  return agent.replace(/[\r\n]/g, " ").slice(0, 160);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Check before session/database work so the unapproved path cannot touch sensitive data.
  if (!sensitiveAccessLogsEnabled()) {
    return NextResponse.json({ message: "민감정보 서버 열람 기능이 아직 승인되지 않았습니다." }, { headers: noStoreHeaders, status: 503 });
  }

  const session = await getCustomerSession();
  if (!session?.userId) return NextResponse.json({ message: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
  const { id } = await params;

  try {
    const result = await revealAccessPasswordForMember({
      actorName: session.operationalDisplayName || session.name,
      assignmentScope: getCustomerAssignmentKeys(session, { forceScope: true })!,
      companyId: session.companyId,
      customerId: id,
      deviceLabel: deviceLabel(request),
      driverNames: [getCustomerOperationalName(session), session.name, session.assignedManagerName || "", session.invitedEmployeeName || ""],
      userId: session.userId
    });
    if (result.status === "unauthorized") return NextResponse.json({ message: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
    if (result.status === "forbidden") return NextResponse.json({ message: "이 거래처의 출입 비밀번호를 볼 권한이 없습니다." }, { headers: noStoreHeaders, status: 403 });
    if (result.status === "not_found") return NextResponse.json({ message: "거래처를 찾을 수 없습니다." }, { headers: noStoreHeaders, status: 404 });
    if (result.status !== "allowed") return NextResponse.json({ message: "민감정보를 표시하지 않았습니다." }, { headers: noStoreHeaders, status: 503 });
    return NextResponse.json({ accessPassword: result.value }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ message: "감사 기록을 저장하지 못해 민감정보를 표시하지 않았습니다." }, { headers: noStoreHeaders, status: 503 });
  }
}
