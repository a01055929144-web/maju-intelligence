import { NextRequest, NextResponse } from "next/server";
import { consumePasswordReset } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string; newPassword?: string } | null;
  const token = body?.token || "";
  const newPassword = body?.newPassword || "";

  if (!token) {
    return NextResponse.json({ ok: false, message: "재설정 링크가 올바르지 않습니다." }, { status: 400 });
  }

  const result = await consumePasswordReset(token, newPassword);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message || "비밀번호 재설정에 실패했습니다." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
