import { NextRequest, NextResponse } from "next/server";
import { validateAccountPassword } from "@/domains/organization/account-login";
import { accountLoginV2Enabled } from "@/lib/account-login-feature";
import { clearAdminSession, clearCustomerSession, getAdminSession, getCustomerSession } from "@/lib/auth";
import { changeAppUserPassword } from "@/lib/store";

export async function POST(request: NextRequest) {
  if (!accountLoginV2Enabled()) return NextResponse.json({ message: "기능이 비활성화되어 있습니다." }, { status: 404 });
  const [admin, customer] = await Promise.all([
    getAdminSession({ allowPasswordChange: true }),
    getCustomerSession({ allowPasswordChange: true })
  ]);
  const userId = admin?.userId || customer?.userId;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || !validateAccountPassword(body.password)) {
    return NextResponse.json({ message: "비밀번호는 10자 이상이어야 합니다." }, { status: 400 });
  }
  await changeAppUserPassword(userId, body.password);
  await Promise.all([clearAdminSession(), clearCustomerSession()]);
  return NextResponse.json({ ok: true });
}
