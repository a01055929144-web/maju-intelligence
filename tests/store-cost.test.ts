import { describe, expect, it, vi } from "vitest";
import { collapseStoreCostDuplicates, parseStoreCostRows, storeCostProductKey, suggestStoreCostMapping } from "../domains/store-cost/store-cost";
import { manageStoreCosts, type StoreCostRepository } from "../application/store-cost/manage-store-costs";

const scope = {
  companyId: "00000000-0000-4000-8000-000000000001",
  storeAccountId: "10000000-0000-4000-8000-000000000001",
  memberId: "20000000-0000-4000-8000-000000000001",
};

describe("store-owned costs", () => {
  it("reuses column mapping semantics and accepts only integer KRW", () => {
    const mapping = suggestStoreCostMapping(["날짜", "상품명", "규격", "단위", "원가(원)"]);
    const rows = parseStoreCostRows([["2026-11-05", "양파", "15kg", "망", "18,000원"]], mapping);
    expect(rows).toEqual([{ effectiveOn: "2026-11-05", productName: "양파", sourceRowNumber: 2, specification: "15kg", unit: "망", costKrw: 18000 }]);
    expect(() => parseStoreCostRows([["2026-11-05", "양파", "15kg", "망", "18.5"]], mapping)).toThrow("원 단위 정수");
  });

  it("normalizes spreadsheet dates and preserves the original duplicate row", () => {
    const mapping = suggestStoreCostMapping(["날짜", "상품명", "단위", "원가"]);
    const rows = parseStoreCostRows([
      [new Date("2026-11-05T00:00:00Z"), "양파", "망", 18000],
      [46336, "양파", "망", 19000],
    ], mapping);
    expect(rows.map(row => row.effectiveOn)).toEqual(["2026-11-05", "2026-11-10"]);
    expect(collapseStoreCostDuplicates([rows[0], { ...rows[1], effectiveOn: rows[0].effectiveOn }])[0].sourceRowNumber).toBe(3);
  });

  it("normalizes duplicates without supplier or distributor identity", () => {
    const first = { effectiveOn: "2026-11-05", productName: " 양파 ", specification: "15 KG", unit: "망", costKrw: 18000 };
    const second = { ...first, productName: "양파", specification: "15kg", costKrw: 19000 };
    expect(storeCostProductKey(first)).toBe(storeCostProductKey(second));
    expect(collapseStoreCostDuplicates([first, second])).toEqual([second]);
  });

  it("hashes a re-upload identically and always passes the full tenant scope", async () => {
    const repository = { list: vi.fn(), history: vi.fn(), import: vi.fn(), edit: vi.fn() } satisfies StoreCostRepository;
    const service = manageStoreCosts(repository);
    const row = { effectiveOn: "2026-11-05", productName: "양파", unit: "망", costKrw: 18000 };
    await service.import(scope, "costs.xlsx", new Uint8Array([1, 2, 3]), [row]);
    await service.import(scope, "again.xlsx", new Uint8Array([1, 2, 3]), [row]);
    expect(repository.import.mock.calls[0][0]).toEqual(scope);
    expect(repository.import.mock.calls[0][1].sha256).toBe(repository.import.mock.calls[1][1].sha256);
  });
});
