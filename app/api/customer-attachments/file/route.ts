import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope } from "@/lib/auth";
import { isOutsideSensitiveWorkSession } from "@/domains/organization/sensitive-access-log";
import { canAccessAssignedCustomer, createCustomerAttachmentSignedUrl, getCustomerAttachmentOwnerByStoragePath } from "@/lib/store";
import { isActiveSensitiveAccessActor, recordSensitiveAccessLog, sensitiveAccessLogsEnabled } from "@/lib/store/07-sensitive-access-logs";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store, private, max-age=0" };

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
  const attachment = await getCustomerAttachmentOwnerByStoragePath(scope.companyId, path);
  if (!attachment) {
    return NextResponse.json({ message: "첨부자료 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  // 병합된 첨부는 Storage 경로에 과거 거래처 ID가 남을 수 있습니다. 경로 문자열이 아니라
  // customer_attachments의 현재 customer_id를 기준으로 권한을 검사해야 병합 후에도 열람할 수 있습니다.
  const canAccess = await canAccessAssignedCustomer(scope.companyId, attachment.customerId, getCustomerAssignmentKeys(scope.customerSession));
  if (!canAccess) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (attachment.attachmentType === "business_license") {
    // 플래그 OFF에서는 기존 파일 열람 동작을 유지한다. ON 전환 뒤에만 N3 감사 경계를 강제한다.
    if (sensitiveAccessLogsEnabled()) {
      if (!scope.customerSession || (!scope.customerSession.userId && scope.customerSession.workspaceRole !== "owner")) {
        return NextResponse.json({ message: "Forbidden" }, { headers: noStoreHeaders, status: 403 });
      }
      if (!(await isActiveSensitiveAccessActor({ companyId: scope.companyId, isLegacyOwner: !scope.customerSession.userId && scope.customerSession.workspaceRole === "owner", userId: scope.customerSession.userId }))) {
        return NextResponse.json({ message: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
      }
      try {
        const recorded = await recordSensitiveAccessLog({
          actorName: scope.customerSession.operationalDisplayName || scope.customerSession.name,
          actorKind: scope.customerSession.userId ? "app_user" : "legacy_owner",
          actorRole: scope.customerSession.workspaceRole,
          actorUserId: scope.customerSession.userId,
          companyId: scope.companyId,
          deviceLabel: (request.headers.get("user-agent") || "알 수 없는 기기").replace(/[\r\n]/g, " ").slice(0, 160),
          item: "business_registration",
          pagePath: "/api/customer-attachments/file",
          storeId: attachment.customerId,
          warningCodes: isOutsideSensitiveWorkSession(scope.customerSession.workspaceRole) ? ["outside_work_session"] : []
        });
        if (!recorded) return NextResponse.json({ message: "사업자등록증 서버 열람 기능이 비활성화됐습니다." }, { headers: noStoreHeaders, status: 503 });
      } catch {
        return NextResponse.json({ message: "감사 기록을 저장하지 못해 사업자등록증을 표시하지 않았습니다." }, { headers: noStoreHeaders, status: 503 });
      }
    }
  }

  const signedUrl = await createCustomerAttachmentSignedUrl(path);
  return NextResponse.redirect(signedUrl, { headers: noStoreHeaders });
}
