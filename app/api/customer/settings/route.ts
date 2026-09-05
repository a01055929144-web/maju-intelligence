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
  if (!body?.name) {
    return NextResponse.json({ error: "회사명은 필수입니다." }, { status: 400 });
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
      ownerName: body.ownerName,
      smsSenderPhone: body.smsSenderPhone,
      telegramChatId: body.telegramChatId
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "회사 설정을 저장하지 못했습니다." }, { status: 400 });
  }
}
