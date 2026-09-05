import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { bulkUpdateDeliveryVehicle } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; customerIds?: string[]; deliveryVehicle?: string } | null;
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
  if (typeof body?.deliveryVehicle !== "string" || !body.deliveryVehicle.trim()) {
    return NextResponse.json({ message: "호차명을 입력하세요." }, { status: 400 });
  }

  const result = await bulkUpdateDeliveryVehicle(scope.companyId, customerIds, body.deliveryVehicle);
  return NextResponse.json(result);
}
