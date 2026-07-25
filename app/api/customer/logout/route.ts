import { NextResponse } from "next/server";
import { clearAdminSession, clearCustomerSession } from "@/lib/auth";

export async function POST() {
  await clearAdminSession();
  await clearCustomerSession();
  return NextResponse.json({ ok: true });
}
