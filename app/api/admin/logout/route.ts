import { NextResponse } from "next/server";
import { clearAdminSession, clearCustomerSession } from "@/lib/auth";

export async function POST() {
  clearAdminSession();
  clearCustomerSession();
  return NextResponse.json({ ok: true });
}
