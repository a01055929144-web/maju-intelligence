import { assertVehicleOperationalStatus, normalizeVehicleMasterInput, type VehicleMasterInput, type VehicleMasterRepository, type VehicleOperationalStatus } from "@/domains/delivery/vehicle-master";

export function listVehicleMaster(repository: VehicleMasterRepository, companyId: string) {
  return repository.list(companyId);
}

export function saveVehicleMaster(repository: VehicleMasterRepository, companyId: string, input: VehicleMasterInput, id?: string) {
  return repository.save(companyId, normalizeVehicleMasterInput(input), id);
}

export function changeVehicleMasterStatus(repository: VehicleMasterRepository, companyId: string, id: string, status: VehicleOperationalStatus) {
  if (!id) throw new Error("차량 ID가 필요합니다.");
  assertVehicleOperationalStatus(status);
  return repository.setStatus(companyId, id, status);
}
