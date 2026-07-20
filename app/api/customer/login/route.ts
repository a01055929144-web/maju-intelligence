import { NextRequest, NextResponse } from "next/server";
import { clearAdminSession, setCustomerSession, validateCustomerCredentials } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const session = await validateCustomerCredentials(body?.email || "", body?.password || "");

  if (!session) {
    return NextResponse.json({ ok: false, message: "고객사 계정 정보를 확인해주세요." }, { status: 401 });
  }

  clearAdminSession();
  setCustomerSession(session);
  return NextResponse.json({ ok: true, session });
}
