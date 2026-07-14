import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { createCustomerAttachmentSignedUrl } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ message: "path는 필수입니다." }, { status: 400 });
  }

  if (scope.companyId && !path.startsWith(`${scope.companyId}/`)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const signedUrl = await createCustomerAttachmentSignedUrl(path);
  return NextResponse.redirect(signedUrl);
}
