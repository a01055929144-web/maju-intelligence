import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { createCustomerAttachmentSignedUrl } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ message: "path는 필수입니다." }, { status: 400 });
  }

  // 2026-08-31 보안 감사 대응: startsWith만으로는 "A사ID/../B사ID/파일"처럼 dot-segment로
  // 접두사 검사를 통과한 뒤, 실제 요청 URL이 정규화되면서 다른 회사 경로로 바뀌는 path traversal을
  // 막지 못합니다. "/"로 나눈 각 구간을 직접 검사해 "..", ".", 빈 구간을 전부 거부합니다.
  const pathSegments = path.split("/");
  if (pathSegments.some((segment) => segment === ".." || segment === "." || segment === "")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (scope.companyId && pathSegments[0] !== scope.companyId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const signedUrl = await createCustomerAttachmentSignedUrl(path);
  return NextResponse.redirect(signedUrl);
}
