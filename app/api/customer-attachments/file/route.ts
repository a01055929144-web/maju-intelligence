import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { createCustomerAttachmentSignedUrl } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ message: "path는 필수입니다." }, { status: 400 });
  }

  const signedUrl = await createCustomerAttachmentSignedUrl(path);
  return NextResponse.redirect(signedUrl);
}
