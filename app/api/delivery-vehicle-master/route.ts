import { NextRequest, NextResponse } from "next/server";
import { changeVehicleMasterStatus, listVehicleMaster, saveVehicleMaster } from "@/application/delivery/manage-vehicle-master";
import type { VehicleMasterInput, VehicleOperationalStatus } from "@/domains/delivery/vehicle-master";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { vehicleMasterRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listVehicleMaster(vehicleMasterRepository, scope.companyId));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as (VehicleMasterInput & { companyId?: string }) | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_members")) return NextResponse.json({ message: "차량 마스터를 관리할 권한이 없습니다." }, { status: 403 });
  if (!body) return NextResponse.json({ message: "차량 정보가 필요합니다." }, { status: 400 });
  try {
    return NextResponse.json({ vehicle: await saveVehicleMaster(vehicleMasterRepository, scope.companyId, body) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "차량 저장에 실패했습니다." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ({ companyId?: string; id?: string; status?: VehicleOperationalStatus } & Partial<VehicleMasterInput>) | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_members")) return NextResponse.json({ message: "차량 마스터를 관리할 권한이 없습니다." }, { status: 403 });
  if (!body?.id) return NextResponse.json({ message: "차량 ID가 필요합니다." }, { status: 400 });
  try {
    const vehicle = body.name && body.plateNumber && body.fuelType
      ? await saveVehicleMaster(vehicleMasterRepository, scope.companyId, body as VehicleMasterInput, body.id)
      : await changeVehicleMasterStatus(vehicleMasterRepository, scope.companyId, body.id, body.status || "inactive");
    return NextResponse.json({ vehicle });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "차량 변경에 실패했습니다." }, { status: 400 });
  }
}
