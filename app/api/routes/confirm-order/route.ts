import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { saveRouteOrderConfirmation } from "@/lib/store";

// 2026-08-28 피드백 대응: 데스크톱(코스 탭)에서 배송담당자별로 확정한 오늘 방문 순서를 서버에
// 저장합니다. 저장된 값은 getTodayRoutePlan을 통해 모바일(기사님 휴대폰) 코스 화면에도 반영됩니다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { driverName?: string; customerIds?: string[]; companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_sales")) {
    return NextResponse.json({ message: "코스를 확정할 권한이 없습니다." }, { status: 403 });
  }

  const driverName = (body?.driverName || "").trim();
  const customerIds = Array.isArray(body?.customerIds) ? body.customerIds.filter((id) => typeof id === "string" && id.trim()) : [];

  if (!driverName) {
    return NextResponse.json({ message: "배송담당자가 지정되지 않았습니다. 담당자가 배정된 배송차만 코스를 확정할 수 있습니다." }, { status: 400 });
  }
  if (!customerIds.length) {
    return NextResponse.json({ message: "확정할 경유지가 없습니다." }, { status: 400 });
  }

  const confirmedBy = scope.role === "customer" ? scope.customerSession?.name || undefined : "관리자";

  const result = await saveRouteOrderConfirmation(scope.companyId, driverName, customerIds, confirmedBy);
  return NextResponse.json(result);
}
