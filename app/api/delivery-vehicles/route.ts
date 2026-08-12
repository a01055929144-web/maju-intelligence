import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { DeliveryVehicleFuelType, getDeliveryVehicleFuelTypes, upsertDeliveryVehicleFuelType } from "@/lib/store";

const allowedFuelTypes: DeliveryVehicleFuelType[] = ["gasoline", "diesel"];

export async function GET(request: NextRequest) {
  const queryCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, queryCompanyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const fuelTypes = await getDeliveryVehicleFuelTypes(scope.companyId);
  return NextResponse.json({ fuelTypes });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; driverName?: string; fuelType?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "배송차 정보를 수정할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.driverName?.trim()) {
    return NextResponse.json({ message: "담당자명이 필요합니다." }, { status: 400 });
  }
  if (!body.fuelType || !allowedFuelTypes.includes(body.fuelType as DeliveryVehicleFuelType)) {
    return NextResponse.json({ message: "연료 타입은 gasoline 또는 diesel 이어야 합니다." }, { status: 400 });
  }

  try {
    const result = await upsertDeliveryVehicleFuelType(scope.companyId, body.driverName, body.fuelType as DeliveryVehicleFuelType);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "배송차 연료 타입 저장에 실패했습니다." }, { status: 400 });
  }
}
