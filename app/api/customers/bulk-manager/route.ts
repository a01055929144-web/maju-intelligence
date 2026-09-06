import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { bulkUpdateDeliveryManager } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; customerIds?: string[]; deliveryManager?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처 정보를 수정할 권한이 없습니다." }, { status: 403 });
  }

  const customerIds = Array.isArray(body?.customerIds)
    ? Array.from(new Set(body.customerIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)))
    : [];
  if (!customerIds.length) {
    return NextResponse.json({ message: "선택된 거래처가 없습니다." }, { status: 400 });
  }
  const deliveryManager = typeof body?.deliveryManager === "string" ? body.deliveryManager.trim() : "";
  if (!deliveryManager) {
    return NextResponse.json({ message: "담당자명을 입력하세요." }, { status: 400 });
  }

  const result = await bulkUpdateDeliveryManager(scope.companyId, customerIds, deliveryManager);
  return NextResponse.json(result);
}
