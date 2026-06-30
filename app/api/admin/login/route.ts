import { NextRequest, NextResponse } from "next/server";
import { setAdminSession, validateAdminCredentials } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const session = validateAdminCredentials(body?.email || "", body?.password || "");

  if (!session) {
    return NextResponse.json({ ok: false, message: "관리자 계정 정보를 확인해주세요." }, { status: 401 });
  }

  setAdminSession(session);
  return NextResponse.json({ ok: true, session });
}

