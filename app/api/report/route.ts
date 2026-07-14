import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getLatestReport } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getLatestReport(scope.companyId));
}
