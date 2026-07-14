import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getUploadHistory } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const uploads = await getUploadHistory(scope.companyId);
  return NextResponse.json({
    companyId: scope.companyId,
    uploads
  });
}
