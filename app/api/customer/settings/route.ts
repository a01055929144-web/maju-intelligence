import { NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { updateCompanySettings } from "@/lib/store";

export async function PATCH(request: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!customerHasCapability(session, "manage_company")) {
    return NextResponse.json({ error: "회사 설정을 변경할 권한이 없습니다. 대표/소유자에게 요청하세요." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "저장할 설정값을 확인해주세요." }, { status: 400 });
  }
  if (!["company", "messaging", "telegram"].includes(body.section)) {
    return NextResponse.json({ error: "저장할 설정 구역이 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "회사명은 필수입니다." }, { status: 400 });
  }
  if (body.section === "company" && body.originAddress?.trim() && (!Number.isFinite(body.originLat) || !Number.isFinite(body.originLng))) {
    return NextResponse.json({ error: "주소 검색 결과에서 물류 출발지를 선택해주세요." }, { status: 400 });
  }

  try {
    const result = await updateCompanySettings(session.companyId, {
      businessType: body.businessType,
      deliveryCompleteMessage: body.deliveryCompleteMessage,
      deliveryIssueMessage: body.deliveryIssueMessage,
      deliveryPartialMessage: body.deliveryPartialMessage,
      name: body.name,
      notificationPhone: body.notificationPhone,
      notificationSenderName: body.notificationSenderName,
      originAddress: body.originAddress,
      originLat: body.originLat,
      originLng: body.originLng,
      ownerName: body.ownerName,
      smsSenderPhone: body.smsSenderPhone,
      telegramChatId: body.telegramChatId,
      section: body.section
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "회사 설정을 저장하지 못했습니다." }, { status: 400 });
  }
}
