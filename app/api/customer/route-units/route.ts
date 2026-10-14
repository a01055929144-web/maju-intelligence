import { NextResponse } from "next/server";
import type { DeliveryRouteUnitInput } from "@/domains/delivery/route-unit";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { listDeliveryRouteUnits, RouteUnitVehicleConflictError, saveDeliveryRouteUnit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ routeUnits: await listDeliveryRouteUnits(session.companyId) });
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!customerHasCapability(session, "manage_company")) {
    return NextResponse.json({ message: "호차를 관리할 권한이 없습니다." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as (DeliveryRouteUnitInput & { id?: string; moveVehicle?: boolean }) | null;
  if (!body) return NextResponse.json({ message: "호차 정보가 필요합니다." }, { status: 400 });
  try {
    const routeUnits = await saveDeliveryRouteUnit(session.companyId, body, { id: body.id, moveVehicle: body.moveVehicle });
    return NextResponse.json({ routeUnits });
  } catch (error) {
    if (error instanceof RouteUnitVehicleConflictError) {
      return NextResponse.json({
        conflict: error.conflict,
        message: `${error.conflict.name}에서 사용 중 — 이 호차로 옮기시겠습니까?`
      }, { status: 409 });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : "호차를 저장하지 못했습니다." }, { status: 400 });
  }
}

