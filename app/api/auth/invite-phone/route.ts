import { NextRequest, NextResponse } from "next/server";
import { setInvitePhoneProof } from "@/lib/auth";
import { checkLoginThrottle, clearLoginThrottle, recordLoginFailure } from "@/lib/rate-limit";
import { verifyInvitationPhoneLastFour } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 초대 링크에서 휴대폰 번호 끝 4자리 확인 → 카카오 인증 때 본인 확인으로 사용(카카오가 번호를 주지 않는 계정 대비). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { inviteCode?: string; lastFour?: string } | null;
  const inviteCode = (body?.inviteCode || "").trim();
  if (!inviteCode) return NextResponse.json({ message: "초대 링크를 다시 열어 주세요." }, { status: 400 });
  const key = `invite-phone:${inviteCode}`;
  const throttle = await checkLoginThrottle(key);
  if (!throttle.allowed) return NextResponse.json({ message: `확인 시도가 많아 잠시 제한되었습니다. ${throttle.retryAfterSeconds}초 후 다시 시도해 주세요.` }, { status: 429 });
  const ok = await verifyInvitationPhoneLastFour(inviteCode, body?.lastFour || "");
  if (!ok) {
    await recordLoginFailure(key);
    return NextResponse.json({ message: "초대받은 휴대폰 번호 끝 4자리가 맞지 않습니다." }, { status: 400 });
  }
  await clearLoginThrottle(key);
  await setInvitePhoneProof(inviteCode);
  return NextResponse.json({ ok: true });
}
