import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

let rows: Array<{ id: string }> | Error = [];
vi.mock("../lib/store", () => ({ supabaseRequest: async () => { if (rows instanceof Error) throw rows; return rows; } }));

describe("pricing tabs (CC-30b)", () => {
  it("the tab bar lists 판매가·행사·임박 always and 매장 가격 only when in use or already on that page", () => {
    const src = readFileSync("components/pricing-tabs.tsx", "utf8");
    for (const label of ["판매가", "행사·임박", "매장 가격"]) expect(src).toContain(label);
    expect(src).toContain('t.key !== "store-prices" || showStorePrices || active === "store-prices"');
    expect(src).toContain('aria-current={t.key === active ? "page" : undefined}');
    expect(src).toContain("previewCompanyId");
  });
  it("usage check: true only with an active non-quote store price, false on error", async () => {
    const { companyUsesStorePrices } = await import("../lib/pricing/store-price-usage");
    rows = [{ id: "a" }]; expect(await companyUsesStorePrices("co")).toBe(true);
    rows = []; expect(await companyUsesStorePrices("co")).toBe(false);
    rows = new Error("db down"); expect(await companyUsesStorePrices("co")).toBe(false);
  });
  it("the three pricing pages render the tabs", () => {
    for (const [page, tab] of [["margins", "margins"], ["promotions", "promotions"], ["store-prices", "store-prices"]])
      expect(readFileSync(`app/revenue/pricing/${page}/page.tsx`, "utf8")).toContain(`<PricingTabs active="${tab}"`);
  });
});
