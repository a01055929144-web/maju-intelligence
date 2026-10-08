import { describe, expect, it } from "vitest";
import { normalizeVehicleMasterInput, summarizeVehicleFleetCounts, type VehicleMaster } from "../domains/delivery/vehicle-master";

describe("vehicle master", () => {
  it("normalizes plate, name and defaults status", () => {
    expect(normalizeVehicleMasterInput({
      fuelType: "diesel",
      memo: "  냉동탑차  ",
      name: "  1호차  ",
      plateNumber: " 12가 3456 "
    })).toEqual({
      fuelType: "diesel",
      memo: "냉동탑차",
      name: "1호차",
      plateNumber: "12가3456",
      status: "active"
    });
  });

  it("rejects an empty vehicle name or plate", () => {
    expect(() => normalizeVehicleMasterInput({ fuelType: "electric", name: " ", plateNumber: "12가3456" })).toThrow("차량명");
    expect(() => normalizeVehicleMasterInput({ fuelType: "electric", name: "전기차", plateNumber: " " })).toThrow("차량번호");
  });

  it("rejects values outside the persisted enums", () => {
    expect(() => normalizeVehicleMasterInput({ fuelType: "hydrogen" as "diesel", name: "수소차", plateNumber: "12가3456" })).toThrow("연료");
    expect(() => normalizeVehicleMasterInput({ fuelType: "diesel", name: "1호차", plateNumber: "12가3456", status: "deleted" as "active" })).toThrow("상태");
  });

  it("keeps registered vehicle count independent from unassigned and stale live signals", () => {
    const vehicles = [
      vehicle("vehicle-1", "1호차", "12가3456"),
      vehicle("vehicle-2", "2호차", "34나7890"),
      vehicle("vehicle-3", "3호차", "56다1234")
    ];

    expect(summarizeVehicleFleetCounts(vehicles, [
      { deliveryVehicle: "1호차", id: "device-1", isStale: false },
      { deliveryVehicle: "2호차", id: "device-2", isStale: false },
      { deliveryVehicle: "3호차", id: "device-3", isStale: true },
      { deliveryVehicle: "개인 사용자", id: "device-unassigned", isStale: false }
    ])).toEqual({
      activeLiveSignals: 3,
      registeredVehicles: 3,
      staleLiveSignals: 1,
      unassignedLiveSignals: 1
    });
  });

  it("deduplicates repeated master rows and live updates by stable id", () => {
    const firstVehicle = vehicle("vehicle-1", "냉동 1호차", "12가3456");

    expect(summarizeVehicleFleetCounts([firstVehicle, firstVehicle], [
      { deliveryVehicle: "냉동 1호차", id: "device-1", isStale: true },
      { deliveryVehicle: " 냉동 1호차 ", id: "device-1", isStale: false }
    ])).toEqual({
      activeLiveSignals: 1,
      registeredVehicles: 1,
      staleLiveSignals: 0,
      unassignedLiveSignals: 0
    });
  });
});

function vehicle(id: string, name: string, plateNumber: string): VehicleMaster {
  return {
    companyId: "company-1",
    createdAt: "2026-10-08T00:00:00.000Z",
    fuelType: "diesel",
    id,
    name,
    plateNumber,
    status: "active",
    updatedAt: "2026-10-08T00:00:00.000Z"
  };
}
