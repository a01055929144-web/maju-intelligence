import { NextResponse } from "next/server";
import { clearAdminSession, clearCustomerSession, clearStoreSession } from "@/lib/auth";

export async function POST() {
  await clearAdminSession();
  await clearCustomerSession();
  await clearStoreSession();
  return NextResponse.json({ ok: true });
}
