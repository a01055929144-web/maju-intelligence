import { NextResponse } from "next/server";
import { clearAdminSession, clearCustomerSession, clearStoreSession } from "@/lib/auth";

// CC-39: 공용 PC용 — 이 브라우저의 관리자·운영·매장 로그인을 모두 해제한다(각 로그아웃은 자기 사이트만 해제).
export async function POST() {
  await Promise.all([clearAdminSession(), clearCustomerSession(), clearStoreSession()]);
  return NextResponse.json({ ok: true });
}
