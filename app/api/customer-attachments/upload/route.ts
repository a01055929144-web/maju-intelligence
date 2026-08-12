import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { uploadCustomerAttachmentFile } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const customerId = String(formData?.get("customerId") || "");
  const attachmentType = String(formData?.get("attachmentType") || "etc");
  const title = String(formData?.get("title") || "");
  const scope = await getRequestAuthScope(request, String(formData?.get("companyId") || "") || undefined);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!customerId) {
    return NextResponse.json({ message: "customerId는 필수입니다." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "업로드할 파일을 선택해주세요." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ message: "파일은 최대 50MB까지 업로드할 수 있습니다." }, { status: 413 });
  }

  let result: Awaited<ReturnType<typeof uploadCustomerAttachmentFile>>;

  try {
    result = await uploadCustomerAttachmentFile({
      attachmentType,
      bytes: await file.arrayBuffer(),
      companyId: scope.companyId,
      contentType: file.type || "application/octet-stream",
      createdByName: scope.customerSession?.name || scope.adminSession?.name,
      customerId,
      filename: file.name,
      title: title || file.name
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: normalizeAttachmentUploadError(error),
        storageReady: false,
        uploaded: false
      },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}

function normalizeAttachmentUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("bucket") || message.includes("customer-attachments")) {
    return "첨부파일 저장소(customer-attachments)가 준비되지 않았습니다. Supabase Storage 버킷 마이그레이션을 먼저 적용해주세요.";
  }
  if (message.includes("413") || message.includes("Payload Too Large")) {
    return "첨부파일 용량이 너무 큽니다. 최대 50MB 파일만 등록할 수 있습니다.";
  }
  if (message.includes("mime") || message.includes("not allowed")) {
    return "지원하지 않는 파일 형식입니다. 이미지, PDF, MP4, MOV 파일만 등록해주세요.";
  }
  if (message.includes("401") || message.includes("403")) {
    return "첨부파일 저장 권한을 확인하지 못했습니다. Supabase 서비스 키와 Storage 권한을 확인해주세요.";
  }
  return message || "첨부파일 저장 중 오류가 발생했습니다.";
}
