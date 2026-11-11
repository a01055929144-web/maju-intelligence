import { describe, expect, it } from "vitest";
import { fetchAllPriceItems } from "../lib/pricing/fetch-all-price-items";

const item = (id: string) => ({ id, name: id, category: "a", groupId: null, itemMargin: null, cost: 1, price: 1, appliedCost: null, appliedMargin: null, appliedRounding: null, active: true, directPrice: null });
const server = (total: number, pageSize: number, drift = false) => (async (url: RequestInfo | URL) => {
  const page = Number(new URL(String(url), "http://x").searchParams.get("page"));
  const ids = Array.from({ length: pageSize }, (_, i) => (page - 1) * pageSize + i).filter((n) => n < total).map((n) => `p${n}`);
  return { ok: true, json: async () => ({ items: ids.map(item), total: drift && page > 1 ? total + 1 : total, pageSize }) };
}) as unknown as typeof fetch;

describe("fetchAllPriceItems", () => {
  it("reads every page", async () => { expect((await fetchAllPriceItems("c", server(130, 50))).length).toBe(130); });
  it("rejects when the total changes while reading", async () => { await expect(fetchAllPriceItems("c", server(130, 50, true))).rejects.toThrow("변경"); });
  it("handles an empty list", async () => { expect(await fetchAllPriceItems("c", server(0, 50))).toEqual([]); });
});
