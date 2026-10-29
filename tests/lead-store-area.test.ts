import { describe, expect, it } from "vitest";
import {
  formatStoreAreaPyeong,
  getStoreAreaSqmFilterBounds,
  isStoreAreaInRange,
  mergePendingInsertStoreArea,
  parseStoreAreaSqm,
  squareMetersToPyeong,
  storeAreaWriteFields
} from "../domains/lead/store-area";

describe("lead store area", () => {
  it("keeps valid square-meter source values and rejects blanks or abnormal values", () => {
    expect(parseStoreAreaSqm("33.058")).toBe(33.06);
    expect(parseStoreAreaSqm("1,234.5")).toBe(1234.5);
    expect(parseStoreAreaSqm(0)).toBeUndefined();
    expect(parseStoreAreaSqm("not-a-number")).toBeUndefined();
    expect(parseStoreAreaSqm(100_001)).toBeUndefined();
  });

  it("converts square meters to pyeong for display only", () => {
    expect(squareMetersToPyeong(33.058)).toBe(10);
    expect(formatStoreAreaPyeong(66.116)).toBe("20평");
  });

  it("matches the map size ranges while excluding unknown areas", () => {
    expect(isStoreAreaInRange(undefined, "lte10")).toBe(false);
    expect(isStoreAreaInRange(29.7522, "lte10")).toBe(true);
    expect(isStoreAreaInRange(99.174, "lte30")).toBe(true);
    expect(isStoreAreaInRange(165.29, "gte30")).toBe(true);
    expect(isStoreAreaInRange(330.58, "10to100")).toBe(true);
  });

  it("uses the unrounded pyeong value at filter boundaries", () => {
    expect(isStoreAreaInRange(9.96 * 3.3058, "lte10")).toBe(true);
    expect(isStoreAreaInRange(9.96 * 3.3058, "10to100")).toBe(false);
    expect(parseStoreAreaSqm(10 * 3.3058)).toBe(33.06);
    expect(isStoreAreaInRange(10 * 3.3058, "lte10")).toBe(true);
    expect(isStoreAreaInRange(10 * 3.3058, "10to100")).toBe(true);
    expect(parseStoreAreaSqm(20 * 3.3058)).toBe(66.12);
    expect(isStoreAreaInRange(20 * 3.3058, "lte20")).toBe(true);
    expect(parseStoreAreaSqm(30 * 3.3058)).toBe(99.17);
    expect(isStoreAreaInRange(30 * 3.3058, "lte30")).toBe(true);
    expect(isStoreAreaInRange(30 * 3.3058, "gte30")).toBe(true);
    expect(squareMetersToPyeong(30.04 * 3.3058)).toBe(30);
    expect(isStoreAreaInRange(30.04 * 3.3058, "lte30")).toBe(false);
    expect(isStoreAreaInRange(30.04 * 3.3058, "gte30")).toBe(true);
  });

  it("uses the same stored-square-meter boundaries for server filters", () => {
    expect(getStoreAreaSqmFilterBounds("lte10")).toEqual({ max: 33.06 });
    expect(getStoreAreaSqmFilterBounds("gte30")).toEqual({ min: 99.17 });
    expect(getStoreAreaSqmFilterBounds("10to100")).toEqual({ min: 33.06, max: 330.58 });
  });

  it("keeps mixed bulk INSERT keys identical and does not erase missing PATCH values", () => {
    const insertRows = [33.06, undefined].map((area) => ({
      business_name: "테스트 매장",
      ...storeAreaWriteFields(area, "insert", true)
    }));

    expect(insertRows.map((row) => Object.keys(row))).toEqual([
      ["business_name", "store_area_sqm"],
      ["business_name", "store_area_sqm"]
    ]);
    expect(insertRows[1].store_area_sqm).toBeNull();
    expect(storeAreaWriteFields(undefined, "update", true)).toEqual({});
    expect(storeAreaWriteFields(66.12, "update", true)).toEqual({ store_area_sqm: 66.12 });
    expect(storeAreaWriteFields(66.12, "insert", false)).toEqual({});
  });

  it("fills a pending duplicate from a later area without overwriting an existing value", () => {
    expect(mergePendingInsertStoreArea(null, 66.12)).toBe(66.12);
    expect(mergePendingInsertStoreArea(null, undefined)).toBeNull();
    expect(mergePendingInsertStoreArea(33.06, 66.12)).toBe(33.06);
  });
});
