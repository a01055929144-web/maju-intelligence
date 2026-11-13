import { describe, expect, it } from "vitest";
import { aggregateSalesProducts, mergeSalesHistory, summarizeCustomerSales } from "../domains/customer/sales-activity";

describe("sales-activity", () => {
  it("aggregates by product: latest price, summed quantity, last date, current price + source", () => {
    const rows = aggregateSalesProducts(
      [
        { key: "a", name: "양파", unit: "kg", quantity: 10, unitPrice: 1000, date: "2026-11-01" },
        { key: "a", name: "양파", unit: "kg", quantity: 5, unitPrice: 1200, date: "2026-11-10" },
        { key: "a", name: "양파", unit: "kg", quantity: 1, unitPrice: 900, date: "2026-10-01" },
        { key: "b", name: "대파", unit: "단", quantity: 2, unitPrice: null, date: "2026-11-11" },
      ],
      new Map([["a", { base: 1300, agreement: { price: 1150, fromQuote: true } }], ["b", { base: 2000, agreement: null }]]),
    );
    expect(rows.map((r) => r.key)).toEqual(["b", "a"]);
    expect(rows[1]).toMatchObject({ quantity: 16, lastUnitPrice: 1200, lastDate: "2026-11-10", currentPrice: 1150, source: "견적" });
    expect(rows[0]).toMatchObject({ currentPrice: 2000, source: "기본", lastUnitPrice: null });
  });
  it("no price known → null, merges history newest first", () => {
    expect(aggregateSalesProducts([{ key: "x", name: "무", unit: "개", quantity: 1, unitPrice: 5, date: "2026-11-01" }], new Map())[0]).toMatchObject({ currentPrice: null, source: null });
    const h = (id: string, date: string) => ({ id, kind: "sale" as const, date, label: id, amount: 1, status: "확정" });
    expect(mergeSalesHistory([h("a", "2026-11-01")], [h("b", "2026-11-05"), h("c", "2026-11-01")]).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("summarizes list columns: price count, last date, this-month sales", () => {
    const out = summarizeCustomerSales(
      [
        { customerId: "c1", date: "2026-11-02", amount: 1000 },
        { customerId: "c1", date: "2026-10-30", amount: 500 },
        { customerId: "c2", date: "2026-11-09", amount: 700 },
      ],
      ["c1", "c1", "c3"],
      "2026-11",
    );
    expect(out.c1).toEqual({ priceCount: 2, lastDate: "2026-11-02", monthSales: 1000 });
    expect(out.c2).toEqual({ priceCount: 0, lastDate: "2026-11-09", monthSales: 700 });
    expect(out.c3).toEqual({ priceCount: 1, lastDate: "", monthSales: 0 });
  });
});
