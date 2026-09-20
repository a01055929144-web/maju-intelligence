import { describe, expect, it } from "vitest";
import { normalizeVehicleMasterInput } from "../domains/delivery/vehicle-master";

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
});
