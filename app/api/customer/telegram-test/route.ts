import { NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getCompanySettings } from "@/lib/store";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST() {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!customerHasCapability(session, "manage_company")) {
    return NextResponse.json({ message: "테스트 발송 권한이 없습니다. 대표/소유자에게 요청하세요." }, { status: 403 });
  }

  const company = await getCompanySettings(session.companyId, session.companyName);
  if (!company.telegramChatId) {
    return NextResponse.json({ message: "먼저 텔레그램 그룹 chat_id를 저장하세요." }, { status: 400 });
  }

  const result = await sendTelegramMessage(
    company.telegramChatId,
    `✅ <b>${company.name}</b> 텔레그램 알림 연결 테스트입니다. 이 메시지가 보이면 이탈 위험 알림이 이 그룹으로 정상 발송됩니다.`
  );

  if (!result.ok) {
    return NextResponse.json({ message: result.error || "발송에 실패했습니다." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
