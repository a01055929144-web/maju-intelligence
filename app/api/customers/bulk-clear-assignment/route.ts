import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { bulkClearDeliveryAssignment } from "@/lib/store";

// 담당자/배송차 삭제 시, 이미 배정된 거래처가 있으면(2026-08-24 피드백: "배송 담당자 필터에서 배송차,
// 매니저 삭제해야하는데 개선이 안된것 같아") 그 거래처들을 먼저 "담당자 미지정" 상태로 되돌려야 배송차
// 자체를 지울 수 있습니다. 삭제 확인 팝업에서 이 엔드포인트를 먼저 호출한 뒤 담당자/배송차를 지웁니다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; customerIds?: string[] } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처 정보를 수정할 권한이 없습니다." }, { status: 403 });
  }

  const customerIds = Array.isArray(body?.customerIds) ? body.customerIds.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
  if (!customerIds.length) {
    return NextResponse.json({ message: "선택된 거래처가 없습니다." }, { status: 400 });
  }

  const result = await bulkClearDeliveryAssignment(scope.companyId, customerIds);
  return NextResponse.json(result);
}
