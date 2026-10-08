export type VehicleFuelType = "diesel" | "gasoline" | "electric" | "hybrid" | "lpg";
export type VehicleOperationalStatus = "active" | "maintenance" | "inactive";

export type VehicleMaster = {
  id: string;
  companyId: string;
  name: string;
  plateNumber: string;
  fuelType: VehicleFuelType;
  status: VehicleOperationalStatus;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};

export type VehicleMasterInput = {
  name: string;
  plateNumber: string;
  fuelType: VehicleFuelType;
  status?: VehicleOperationalStatus;
  memo?: string;
};

export interface VehicleMasterRepository {
  list(companyId: string): Promise<{ available: boolean; vehicles: VehicleMaster[] }>;
  save(companyId: string, input: VehicleMasterInput, id?: string): Promise<VehicleMaster>;
  setStatus(companyId: string, id: string, status: VehicleOperationalStatus): Promise<VehicleMaster>;
}

export type VehicleLiveSignalSummaryInput = {
  deliveryVehicle?: string;
  id: string;
  isStale: boolean;
};

export type VehicleFleetCountSummary = {
  activeLiveSignals: number;
  registeredVehicles: number;
  staleLiveSignals: number;
  unassignedLiveSignals: number;
};

const vehicleFuelTypes: VehicleFuelType[] = ["diesel", "gasoline", "electric", "hybrid", "lpg"];
const vehicleOperationalStatuses: VehicleOperationalStatus[] = ["active", "maintenance", "inactive"];

export function assertVehicleOperationalStatus(status: unknown): asserts status is VehicleOperationalStatus {
  if (!vehicleOperationalStatuses.includes(status as VehicleOperationalStatus)) throw new Error("올바른 차량 상태를 선택하세요.");
}

export function normalizeVehicleMasterInput(input: VehicleMasterInput): VehicleMasterInput {
  const name = input.name.trim();
  const plateNumber = input.plateNumber.replace(/\s+/g, "").toUpperCase();
  if (!name) throw new Error("차량명을 입력하세요.");
  if (!plateNumber) throw new Error("차량번호를 입력하세요.");
  if (name.length > 80 || plateNumber.length > 20) throw new Error("차량명 또는 차량번호가 너무 깁니다.");
  if (!vehicleFuelTypes.includes(input.fuelType)) throw new Error("올바른 연료 종류를 선택하세요.");
  if (input.status !== undefined) assertVehicleOperationalStatus(input.status);
  return { ...input, memo: input.memo?.trim() || undefined, name, plateNumber, status: input.status || "active" };
}

/**
 * Vehicle master rows and mobile GPS signals are deliberately counted separately.
 * A phone may send an extra, stale, or not-yet-linked signal, but that must never
 * inflate the number labelled as registered vehicles in the map workspace.
 */
export function summarizeVehicleFleetCounts(
  vehicles: readonly Pick<VehicleMaster, "id" | "name" | "plateNumber" | "status">[],
  liveSignals: readonly VehicleLiveSignalSummaryInput[]
): VehicleFleetCountSummary {
  const activeVehicles = uniqueById(vehicles.filter((vehicle) => vehicle.status === "active"));
  const activeVehicleKeys = new Set(
    activeVehicles.flatMap((vehicle) => [vehicle.name, vehicle.plateNumber]).map(normalizeVehicleIdentity).filter(Boolean)
  );
  const uniqueSignals = uniqueById(liveSignals);

  return {
    activeLiveSignals: uniqueSignals.filter((signal) => !signal.isStale).length,
    registeredVehicles: activeVehicles.length,
    staleLiveSignals: uniqueSignals.filter((signal) => signal.isStale).length,
    unassignedLiveSignals: uniqueSignals.filter((signal) => {
      const vehicleKey = normalizeVehicleIdentity(signal.deliveryVehicle || "");
      return !vehicleKey || !activeVehicleKeys.has(vehicleKey);
    }).length
  };
}

function normalizeVehicleIdentity(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
