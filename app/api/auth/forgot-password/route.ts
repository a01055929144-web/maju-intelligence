import { NextRequest, NextResponse } from "next/server";
import { createPasswordResetRequest } from "@/lib/store";
import { sendEmail } from "@/lib/email";
import { checkLoginThrottle, recordLoginFailure } from "@/lib/rate-limit";

// 어떤 이메일이든 항상 같은 문구를 돌려줍니다 — 가입 여부가 응답으로 새어나가지 않도록 하기
// 위함입니다(계정 존재 여부 스캐닝 방지).
const GENERIC_MESSAGE = "가입된 이메일이면 비밀번호 재설정 링크를 보내드렸습니다. 메일함(스팸함 포함)을 확인해주세요.";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = (body?.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, message: "이메일을 입력해주세요." }, { status: 400 });
  }

  const throttle = checkLoginThrottle(`forgot-password:${email}`);
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, message: `요청이 많아 잠시 제한되었습니다. ${throttle.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }
  recordLoginFailure(`forgot-password:${email}`);

  const result = await createPasswordResetRequest(email).catch(() => null);

  if (result) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(result.token)}`;
    const emailResult = await sendEmail({
      to: email,
      subject: "MAJU Intelligence 비밀번호 재설정",
      html: `
        <p>${result.ownerName ? `${result.ownerName}님, ` : ""}${result.companyName} 계정의 비밀번호 재설정을 요청하셨습니다.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>이 링크는 30분 동안만 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해주세요.</p>
      `
    });
    if (!emailResult.ok) {
      console.error("[forgot-password] 이메일 발송 실패:", emailResult.reason, "->", email);
    }
  }

  // result가 null이어도(가입 안 된 이메일) 항상 같은 응답을 줍니다.
  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
