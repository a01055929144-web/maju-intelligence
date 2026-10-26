import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { issueStaffLocationDeviceToken, revokeStaffLocationDeviceTokens } from "@/lib/staff-location-device-token";

export async function POST(request: NextRequest) {
  const session = await getCustomerSession();
  if (!session?.userId) return NextResponse.json({ error: "직원 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { consentVersion?: string; deviceLabel?: string } | null;
  const consentVersion = body?.consentVersion?.trim() || "";
  if (!consentVersion) return NextResponse.json({ error: "위치 이용 동의가 필요합니다." }, { status: 400 });
  try {
    return NextResponse.json(await issueStaffLocationDeviceToken({ actorName: getCustomerOperationalName(session), companyId: session.companyId, consentVersion, deviceLabel: body?.deviceLabel, userId: session.userId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "기기 등록에 실패했습니다.";
    if (/staff_location_device_tokens|schema cache|does not exist/i.test(message)) return NextResponse.json({ error: "기기 토큰 SQL 적용 후 사용할 수 있습니다." }, { status: 503 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const session = await getCustomerSession();
  if (!session?.userId) return NextResponse.json({ error: "직원 로그인이 필요합니다." }, { status: 401 });
  try {
    await revokeStaffLocationDeviceTokens(session.companyId, session.userId);
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "기기 해제에 실패했습니다." }, { status: 400 });
  }
}
