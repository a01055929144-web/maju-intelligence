import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { uploadCustomerAttachmentFile } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const customerId = String(formData?.get("customerId") || "");
  const attachmentType = String(formData?.get("attachmentType") || "etc");
  const title = String(formData?.get("title") || "");

  if (!customerId) {
    return NextResponse.json({ message: "customerId는 필수입니다." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "업로드할 파일을 선택해주세요." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ message: "파일은 최대 50MB까지 업로드할 수 있습니다." }, { status: 413 });
  }

  const result = await uploadCustomerAttachmentFile({
    attachmentType,
    bytes: await file.arrayBuffer(),
    companyId: customerSession?.companyId,
    contentType: file.type || "application/octet-stream",
    createdByName: customerSession?.name || adminSession?.name,
    customerId,
    filename: file.name,
    title: title || file.name
  });

  return NextResponse.json(result);
}
