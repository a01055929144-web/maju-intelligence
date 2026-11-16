import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { listCompanyStoreNotifications, markCompanyNotificationRead, processCompanyStoreNotification } from "@/lib/store/07-company-notifications";

const noStore = { "Cache-Control": "no-store" };
export async function GET() {
  const session = await getCustomerSession();
  if (!session?.userId) return NextResponse.json({ message: "로그인을 확인해 주세요." }, { status: 401, headers: noStore });
  if (!isFeatureEnabled("STORE_PROFILE_SETTINGS", session.companyId)) return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404, headers: noStore });
  return NextResponse.json({ items: await listCompanyStoreNotifications(session.companyId) }, { headers: noStore });
}

export async function PATCH(request: NextRequest) {
  const session = await getCustomerSession();
  if (!session?.userId) return NextResponse.json({ message: "로그인을 확인해 주세요." }, { status: 401, headers: noStore });
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  if (!isFeatureEnabled("STORE_PROFILE_SETTINGS", session.companyId)) return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404, headers: noStore });
  const body = await request.json().catch(() => null) as { action?: string; id?: string; type?: string } | null;
  if (!body?.id || !body.action) return NextResponse.json({ message: "알림을 확인해 주세요." }, { status: 400, headers: noStore });
  try {
    if (body.action === "read") await markCompanyNotificationRead(session.companyId, body.id, session.userId);
    else if (body.action === "process" && body.type) await processCompanyStoreNotification({ actorId: session.userId,
      actorName: session.operationalDisplayName || session.name, companyId: session.companyId, notificationId: body.id, type: body.type });
    else return NextResponse.json({ message: "처리 방법을 확인해 주세요." }, { status: 400, headers: noStore });
    return NextResponse.json({ saved: true }, { headers: noStore });
  } catch (error) {
    const superseded = error instanceof Error && error.message.includes("store_profile_notification_superseded");
    return NextResponse.json({ message: superseded ? "더 새로운 매장 정보 알림을 먼저 반영해 주세요." : "알림을 처리하지 못했습니다." }, { status: superseded ? 409 : 503, headers: noStore });
  }
}
