export type DeliveryRouteUnit = {
  id: string;
  companyId: string;
  territoryId: string;
  territoryName: string;
  name: string;
  currentVehicleId?: string;
  currentVehicleName?: string;
  currentVehiclePlateNumber?: string;
  defaultDriverStaffMemberId?: string;
  defaultDriverName?: string;
  isActive: boolean;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryRouteUnitInput = {
  territoryId: string;
  name: string;
  currentVehicleId?: string;
  defaultDriverStaffMemberId?: string;
  isActive?: boolean;
  memo?: string;
};

export type RouteUnitReference = { id: string; companyId: string; isActive?: boolean; name?: string };

export function findActiveVehicleConflict(
  units: Array<{ id: string; name: string; currentVehicleId?: string; isActive: boolean }>,
  vehicleId: string | undefined,
  editingId: string | undefined,
  nextIsActive: boolean
) {
  if (!vehicleId || !nextIsActive) return undefined;
  return units.find((unit) => unit.isActive && unit.id !== editingId && unit.currentVehicleId === vehicleId);
}

export function validateDeliveryRouteUnitInput(
  companyId: string,
  input: DeliveryRouteUnitInput,
  references: {
    territories: RouteUnitReference[];
    staff: RouteUnitReference[];
    vehicles: RouteUnitReference[];
  }
) {
  const name = input.name.trim();
  if (!name) throw new Error("호차명을 입력하세요.");
  if (name.length > 80) throw new Error("호차명은 80자 이내로 입력하세요.");
  const territory = references.territories.find((item) => item.id === input.territoryId && item.companyId === companyId);
  if (!territory) throw new Error("이 회사의 배송 권역을 선택하세요.");

  const driver = input.defaultDriverStaffMemberId
    ? references.staff.find((item) => item.id === input.defaultDriverStaffMemberId && item.companyId === companyId && item.isActive !== false)
    : undefined;
  if (input.defaultDriverStaffMemberId && !driver) throw new Error("선택한 기사는 현재 이 회사의 활성 직원이 아닙니다.");

  const vehicle = input.currentVehicleId
    ? references.vehicles.find((item) => item.id === input.currentVehicleId && item.companyId === companyId)
    : undefined;
  if (input.currentVehicleId && !vehicle) throw new Error("선택한 차량은 이 회사의 차량 마스터에 없습니다.");

  return {
    currentVehicleId: vehicle?.id,
    defaultDriverStaffMemberId: driver?.id,
    isActive: input.isActive !== false,
    memo: input.memo?.trim() || undefined,
    name,
    territoryId: territory.id
  };
}

