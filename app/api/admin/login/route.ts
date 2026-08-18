import { NextRequest, NextResponse } from "next/server";
import { clearCustomerSession, setAdminSession, validateAdminCredentials } from "@/lib/auth";
import { checkLoginThrottle, clearLoginThrottle, recordLoginFailure } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const identifier = `admin:${body?.email || "unknown"}`;

  const throttle = checkLoginThrottle(identifier);
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, message: `로그인 시도가 많아 잠시 제한되었습니다. ${throttle.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  const session = await validateAdminCredentials(body?.email || "", body?.password || "");

  if (!session) {
    recordLoginFailure(identifier);
    return NextResponse.json({ ok: false, message: "관리자 계정 정보를 확인해주세요." }, { status: 401 });
  }

  clearLoginThrottle(identifier);
  await clearCustomerSession();
  await setAdminSession(session);
  return NextResponse.json({ ok: true, session });
}
