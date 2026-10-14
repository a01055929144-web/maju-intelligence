import { describe, expect, it } from "vitest";
import { findActiveVehicleConflict, validateDeliveryRouteUnitInput } from "../domains/delivery/route-unit";
import { filterCustomersByAssignment } from "../lib/store";

describe("delivery route unit", () => {
  const references = {
    territories: [{ id: "territory-a", companyId: "company-a", name: "강남" }],
    staff: [{ id: "staff-a", companyId: "company-a", isActive: true, name: "정두영" }],
    vehicles: [{ id: "vehicle-a", companyId: "company-a", name: "61버2485" }]
  };

  it("rejects vehicle and staff ids owned by another company", () => {
    expect(() => validateDeliveryRouteUnitInput("company-a", {
      territoryId: "territory-a", name: "1호차", currentVehicleId: "vehicle-other"
    }, { ...references, vehicles: [{ id: "vehicle-other", companyId: "company-b" }] })).toThrow("이 회사의 차량 마스터");
    expect(() => validateDeliveryRouteUnitInput("company-a", {
      territoryId: "territory-a", name: "1호차", defaultDriverStaffMemberId: "staff-other"
    }, { ...references, staff: [{ id: "staff-other", companyId: "company-b", isActive: true }] })).toThrow("이 회사의 활성 직원");
  });

  it("detects a vehicle already assigned to another active route unit", () => {
    expect(findActiveVehicleConflict([
      { id: "unit-a", name: "1호차", currentVehicleId: "vehicle-a", isActive: true }
    ], "vehicle-a", "unit-b", true)?.name).toBe("1호차");
    expect(findActiveVehicleConflict([
      { id: "unit-a", name: "1호차", currentVehicleId: "vehicle-a", isActive: false }
    ], "vehicle-a", "unit-b", true)).toBeUndefined();
  });

  it("does not use the physical vehicle to decide customer visibility", () => {
    const customer = {
      id: "customer", customerName: "거래처", address: "서울", region: "강남", industry: "미분류",
      grade: "C" as const, deliveryKm: 0, lastOrderDays: 0, memoCount: 0, monthlyRevenue: 0, visitCount: 0,
      deliveryManager: "정두영", assignedStaffMemberId: "staff-a", deliveryVehicle: "강남"
    };
    const scope = { staffMemberId: "staff-a", legacyManagerKeys: ["정두영"], legacyTerritoryKeys: [] };
    expect(filterCustomersByAssignment([customer], scope)).toHaveLength(1);
    expect(filterCustomersByAssignment([{ ...customer, deliveryVehicleId: "replacement-vehicle" }], scope)).toHaveLength(1);
  });
});

