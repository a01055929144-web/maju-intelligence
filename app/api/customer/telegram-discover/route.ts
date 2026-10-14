import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { findTelegramChatByConnectionCode, getTelegramBotDiscoveryInfo, isTelegramConfigured } from "@/lib/telegram";

function connectionCode(companyId: string) {
  const secret = process.env.TELEGRAM_BOT_TOKEN || "";
  return `MAJU-${createHmac("sha256", secret).update(companyId).digest("hex").slice(0, 10).toUpperCase()}`;
}

async function authorizedSession() {
  const session = await getCustomerSession();
  if (!session) return { response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!customerHasCapability(session, "manage_company")) {
    return { response: NextResponse.json({ message: "텔레그램 설정 권한이 없습니다. 대표/소유자에게 요청하세요." }, { status: 403 }) };
  }
  if (!isTelegramConfigured()) return { response: NextResponse.json({ message: "텔레그램 봇 연결이 아직 설정되지 않았습니다." }, { status: 503 }) };
  return { session };
}

export async function GET() {
  const auth = await authorizedSession();
  if (auth.response) return auth.response;
  const bot = await getTelegramBotDiscoveryInfo();
  if (!bot.ok || !bot.info) return NextResponse.json({ message: bot.error || "텔레그램 봇 정보를 확인하지 못했습니다." }, { status: 502 });
  if (bot.info.webhookConfigured) {
    return NextResponse.json(
      { message: "현재 텔레그램 봇이 웹훅 방식으로 연결되어 자동 가져오기를 사용할 수 없습니다. 관리자에게 문의해주세요." },
      { status: 409 }
    );
  }
  const code = connectionCode(auth.session.companyId);
  return NextResponse.json({ connectionCode: code, connectionCommand: `/connect@${bot.info.username} ${code}` });
}

export async function POST() {
  const auth = await authorizedSession();
  if (auth.response) return auth.response;
  const bot = await getTelegramBotDiscoveryInfo();
  if (!bot.ok || !bot.info) return NextResponse.json({ message: bot.error || "텔레그램 봇 정보를 확인하지 못했습니다." }, { status: 502 });
  if (bot.info.webhookConfigured) {
    return NextResponse.json(
      { message: "현재 텔레그램 봇이 웹훅 방식으로 연결되어 자동 가져오기를 사용할 수 없습니다. 관리자에게 문의해주세요." },
      { status: 409 }
    );
  }
  const result = await findTelegramChatByConnectionCode(connectionCode(auth.session.companyId));
  if (!result.ok || !result.chat) return NextResponse.json({ message: result.error || "텔레그램 그룹을 찾지 못했습니다." }, { status: 404 });
  return NextResponse.json(result.chat);
}
