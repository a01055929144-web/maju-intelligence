import { describe, expect, it } from "vitest";
import { analyzeCompany, normalizeRows } from "../lib/analysis";
import type { CustomerRow } from "../lib/sample-data";

function makeRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    companyName: "테스트 회사",
    customerName: "성수 온반",
    region: "성수동",
    address: "서울 성동구 성수동",
    industry: "한식",
    monthlyRevenue: 400,
    lastOrderDays: 3,
    visitCount: 4,
    deliveryKm: 7.4,
    ...overrides
  };
}

describe("normalizeRows", () => {
  it("drops rows with no customer name", () => {
    const rows = normalizeRows([makeRow({ customerName: "" })]);
    expect(rows).toHaveLength(0);
  });

  it("deduplicates rows with the same name+address", () => {
    const rows = normalizeRows([makeRow(), makeRow()]);
    expect(rows).toHaveLength(1);
  });

  it("keeps rows with the same name but different address", () => {
    const rows = normalizeRows([makeRow(), makeRow({ address: "서울 강남구 역삼동" })]);
    expect(rows).toHaveLength(2);
  });

  it("coerces missing numeric fields to 0 and fills default text fields", () => {
    const [row] = normalizeRows([
      makeRow({
        region: undefined as unknown as string,
        monthlyRevenue: undefined as unknown as number,
        lastOrderDays: undefined as unknown as number
      })
    ]);
    expect(row.region).toBe("미분류");
    expect(row.monthlyRevenue).toBe(0);
    expect(row.lastOrderDays).toBe(0);
  });
});

describe("analyzeCompany", () => {
  it("returns a zeroed-out result for an empty input", () => {
    const result = analyzeCompany([]);
    expect(result.customers).toBe(0);
    expect(result.regions).toBe(0);
    expect(result.leadRecommendations).toEqual([]);
  });

  it("builds region/industry distributions and a bounded health score", () => {
    const rows = [
      makeRow(),
      makeRow({ customerName: "성수 국밥집", monthlyRevenue: 380, lastOrderDays: 6 }),
      makeRow({ customerName: "강남 정식", region: "강남구", address: "서울 강남구 역삼동", monthlyRevenue: 610, lastOrderDays: 2 })
    ];

    const result = analyzeCompany(rows);

    expect(result.customers).toBe(3);
    expect(result.regions).toBe(2);
    expect(result.regionDistribution[0].region).toBe("성수동");
    expect(result.regionDistribution[0].count).toBe(2);
    expect(result.health.total).toBeGreaterThanOrEqual(0);
    expect(result.health.total).toBeLessThanOrEqual(100);
  });

  it("produces at most 10 lead recommendations, sorted by score descending", () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      makeRow({
        customerName: `매장 ${index}`,
        region: `지역${index}`,
        address: `서울 어딘가 ${index}`
      })
    );

    const result = analyzeCompany(rows);

    expect(result.leadRecommendations.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < result.leadRecommendations.length; i += 1) {
      expect(result.leadRecommendations[i - 1].score).toBeGreaterThanOrEqual(result.leadRecommendations[i].score);
    }
  });
});
