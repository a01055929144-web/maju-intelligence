import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAdminDashboardPayload } from "@/lib/store";

export async function GET(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getAdminDashboardPayload({ excludePilot: new URL(request.url).searchParams.get("excludePilot") === "1" }));
}
