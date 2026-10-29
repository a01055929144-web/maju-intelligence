import { describe, expect, it } from "vitest";
import { formatStoreAreaPyeong, isStoreAreaInRange, parseStoreAreaSqm, squareMetersToPyeong } from "../domains/lead/store-area";

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
});
