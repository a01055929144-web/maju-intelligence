import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAdminDashboardPayload } from "@/lib/store";

export async function GET() {
  if (!getAdminSession()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getAdminDashboardPayload());
}
