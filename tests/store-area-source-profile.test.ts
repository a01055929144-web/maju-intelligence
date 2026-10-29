import { describe, expect, it } from "vitest";
import { parseRawStoreArea, profileStoreAreaSource } from "../domains/lead/store-area-source-profile";

describe("store area source profile", () => {
  it("separates blanks, zeroes, valid positives and invalid outliers", () => {
    expect(parseRawStoreArea("")).toEqual({ kind: "blank" });
    expect(parseRawStoreArea("0")).toEqual({ kind: "zero", value: 0 });
    expect(parseRawStoreArea("1,234.567")).toEqual({ kind: "positive", value: 1234.57 });
    expect(parseRawStoreArea(-1)).toEqual({ kind: "invalid", value: -1 });
    expect(parseRawStoreArea(100_001)).toEqual({ kind: "invalid", value: 100_001 });
    expect(parseRawStoreArea("unknown")).toEqual({ kind: "invalid", value: undefined });
  });

  it("reports actual observations separately from extrapolated estimates", () => {
    const profile = profileStoreAreaSource([
      { areaRaw: "", industry: "한식", source: "sample" },
      { areaRaw: 0, industry: "한식", source: "sample" },
      { areaRaw: 10, industry: "한식", source: "sample" },
      { areaRaw: 30, industry: "한식", source: "sample" },
      { areaRaw: 100_001, industry: "카페", source: "sample" }
    ], { estimatedSourceRows: 100, minimumIndustrySample: 2 });

    expect(profile.actual).toMatchObject({ blank: 1, invalid: 1, medianSqm: 20, positive: 2, rows: 5, zero: 1 });
    expect(profile.byIndustry).toEqual([{ industry: "한식", medianSqm: 20, positiveRows: 2, sampledRows: 4 }]);
    expect(profile.estimated).toEqual({ blank: 20, invalid: 20, positive: 40, sourceRows: 100, zero: 20 });
  });

  it("does not emit estimates when the source population is unknown", () => {
    expect(profileStoreAreaSource([{ areaRaw: 33, source: "sample" }]).estimated).toBeUndefined();
  });
});
