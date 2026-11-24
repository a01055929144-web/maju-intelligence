import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCATION_ROLE_COLORS, LOCATION_ROLE_LABELS, locationRoleFromDuties } from "../domains/delivery/location-role";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/store/00-core", () => ({ isProductionStoreConfigured: () => true, supabaseRequest: mocks.request }));
vi.mock("../lib/store", () => ({ getErrorMessage: () => "", kstDayRangeIso: () => ({ end: "", start: "" }) }));

import { getStaffVehicleLocations } from "../lib/store/09-staff-location";
import { createLiveVehicleMarkers } from "../components/map/vehicle-helpers";

const company = "11111111-1111-1111-1111-111111111111";
const users = { alba: "aaaaaaaa-0000-0000-0000-000000000001", driver: "aaaaaaaa-0000-0000-0000-000000000002", mixed: "aaaaaaaa-0000-0000-0000-000000000003", sales: "aaaaaaaa-0000-0000-0000-000000000004" };

describe("CX-135 직원 위치 역할", () => {
  beforeEach(() => { mocks.request.mockReset(); });

  it("담당 업무로 역할을 정한다: 배송 > 영업 > 그 외(알바·사무·기타·없음)는 현장", () => {
    expect(locationRoleFromDuties(["delivery"])).toBe("delivery");
    expect(locationRoleFromDuties(["sales", "delivery"])).toBe("delivery");
    expect(locationRoleFromDuties(["sales"])).toBe("sales");
    expect(locationRoleFromDuties(["office"])).toBe("field");
    expect(locationRoleFromDuties(["other"])).toBe("field");
    expect(locationRoleFromDuties([])).toBe("field");
    expect(locationRoleFromDuties(null)).toBe("field");
    expect(LOCATION_ROLE_LABELS).toEqual({ delivery: "배송", field: "알바·현장", sales: "영업" });
    expect(LOCATION_ROLE_COLORS.delivery).toBeNull(); // 배송은 기존 차량 색
    expect(new Set([LOCATION_ROLE_COLORS.sales, LOCATION_ROLE_COLORS.field]).size).toBe(2);
  });

  it("서버 위치 읽기가 구성원의 duties로 역할을 붙인다(역할로 거르지 않음)", async () => {
    const now = new Date().toISOString();
    mocks.request.mockImplementation(async (path: string) => {
      if (path.startsWith("company_members")) {
        expect(path).toContain("select=user_id,duties,app_users(name,status)");
        return [
          { user_id: users.driver, duties: ["delivery"], app_users: { name: "기사", status: "active" } },
          { user_id: users.sales, duties: ["sales"], app_users: { name: "영업", status: "active" } },
          { user_id: users.alba, duties: [], app_users: { name: "알바", status: "active" } },
          { user_id: users.mixed, duties: ["sales", "delivery"], app_users: { name: "겸임", status: "active" } }
        ];
      }
      if (path.startsWith("rpc/list_latest_operational_staff_locations")) {
        return Object.values(users).map((userId, index) => ({ id: `ev-${index}`, user_id: userId, device_id: null, latitude: 37.5 + index / 1000, longitude: 127, accuracy_m: 10, recorded_at: now, current_customer_id: null, delivery_vehicle: null, driver_name: null }));
      }
      return [];
    });
    const locations = await getStaffVehicleLocations(company);
    const roleOf = (userId: string) => locations.find((item) => item.userId === userId)?.locationRole;
    expect(locations).toHaveLength(4);
    expect([roleOf(users.driver), roleOf(users.sales), roleOf(users.alba), roleOf(users.mixed)]).toEqual(["delivery", "sales", "field", "delivery"]);
  });

  it("지도 마커: 영업·알바는 역할 색과 역할 글자(색만으로 구분하지 않음), 배송은 기존 차량 표시 그대로", () => {
    const base = { displayState: "realtime" as const, driverName: "홍길동", displayName: "홍길동", id: "x", isStale: false, lastLocationAt: new Date().toISOString(), lat: 37.5, lng: 127, status: "active" as const, userId: "u" };
    const [delivery, sales, field] = createLiveVehicleMarkers([
      { ...base, id: "d", deliveryVehicle: "1호차", locationRole: "delivery" },
      { ...base, id: "s", locationRole: "sales" },
      { ...base, id: "f", locationRole: "field" }
    ], new Map());
    expect(delivery.label).toBe("1호차"); expect(delivery.markerColor).not.toBe(LOCATION_ROLE_COLORS.sales);
    expect(sales.markerColor).toBe(LOCATION_ROLE_COLORS.sales); expect(sales.label).toContain("영업"); expect(sales.name).toContain("영업");
    expect(field.markerColor).toBe(LOCATION_ROLE_COLORS.field); expect(field.label).toContain("알바"); expect(field.name).toContain("알바·현장");
    // 역할 정보가 없던 옛 데이터는 배송으로 본다
    expect(createLiveVehicleMarkers([{ ...base, id: "old", deliveryVehicle: "2호차" }], new Map())[0].label).toBe("2호차");
    // 오래된 위치는 역할과 상관없이 회색
    expect(createLiveVehicleMarkers([{ ...base, isStale: true, locationRole: "sales" }], new Map())[0].markerColor).toBe("#64748b");
  });
});
