import { afterEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/domains/order/order-rules", () => import("../domains/order/order-rules"));
vi.mock("../lib/pricing/store-link-token", () => ({ verifyStoreLinkToken: () => ({ id: "link", hash: "hash" }) }));
import { readStorefront } from "../lib/pricing/storefront";
import { toPublicStorefront } from "../lib/pricing/storefront-public";
afterEach(() => vi.unstubAllEnvs());
it("keeps the link's published selling price and compares only its preceding version; hides overrides and OFF", async () => {
  vi.stubEnv("STOREFRONT_PRICE_DIRECTION_ENABLED", "true");
  let agreement = false, market = false, active = true, optedIn = true, historyError = false;
  const line = { productId: "product", displayName: "게시 품목", unit: "bag", spec: "1kg", visible: true, price: 1200, taxType: "exempt", promotionId: null };
  const content = { kind: "sheet", recipient: "store", showPrice: true, validUntil: "2099-12-31", lines: [line] };
  const seen: string[] = [];
  db.mockImplementation(async (path: string) => {
    seen.push(path);
    if (path.startsWith("storefront_links?")) return [{ id: "link", company_id: "company", customer_id: "customer", document_version_id: "frozen-version", expires_at: "2099-12-31", revoked_at: null, can_order: true }];
    if (path.startsWith("pricing_document_versions?")) {
      if (path.includes("&version=eq.2&")) {
        if (historyError) throw new Error("synthetic history unavailable");
        return [{ version: 2, content: { ...content, lines: [{ ...line, price: 1000 }] } }];
      }
      expect(path).toContain("&id=eq.frozen-version&");
      return [{ id: "frozen-version", document_id: "doc", version: 3, content }];
    }
    if (path.startsWith("normalized_customers?")) return [{ id: "customer", customer_name: "synthetic", delivery_territory_id: null }];
    if (path.startsWith("store_order_settings?")) return [{ cutoff_days_before: 1, cutoff_time: "22:00", minimum_amount: 0, minimum_policy: "notice", delivery_fee: 0, show_storefront_price_direction: optedIn }];
    if (path.startsWith("product_catalog?")) return [{ id: "product", is_active: active, order_pricing_mode: market ? "market" : "fixed", name: "변경된 원장 품목", spec: "999kg", sales_unit: "BOX", tax_type: "taxable", sales_price: 9900 }];
    if (path.startsWith("store_order_customer_rules?")) return [{ delivery_weekdays: [0, 1, 2, 3, 4, 5, 6], cutoff_days_before: 0, cutoff_time: "23:59" }];
    if (path.startsWith("customer_price_agreements?") && agreement) return [{ product_catalog_id: "product", sales_unit: "bag", unit_price: 900, tax_type: "exempt", price_includes_tax: false }];
    return [];
  });
  const result = await readStorefront("token");
  expect(result?.version).toBe(3);
  expect(toPublicStorefront(result!).lines[0]).toMatchObject({ name: "게시 품목", spec: "1kg", unit: "bag", taxType: "exempt", unitPrice: 1200, salesPriceDirection: "up" });
  expect(seen.find(path => path.includes("&version=eq.2&"))).toContain("company_id=eq.company&document_id=eq.doc");
  expect(seen.some(path => /purchase_receipt|product_base_prices|supplier|margin/.test(path))).toBe(false);
  historyError = true;
  const historyUnavailable = await readStorefront("token");
  expect(historyUnavailable?.version).toBe(3);
  expect(result?.canOrder).toBe(true);
  expect(historyUnavailable?.canOrder).toBe(true);
  expect(toPublicStorefront(historyUnavailable!).lines[0]).toMatchObject({ unitPrice: 1200 });
  expect(toPublicStorefront(historyUnavailable!).lines[0]).not.toHaveProperty("salesPriceDirection");
  historyError = false;
  for (const mode of ["agreement", "market", "inactive", "optout", "masteroff"]) {
    agreement = mode === "agreement"; market = mode === "market"; active = mode !== "inactive"; optedIn = mode !== "optout";
    vi.stubEnv("STOREFRONT_PRICE_DIRECTION_ENABLED", mode === "masteroff" ? "false" : "true");
    seen.length = 0;
    const hidden = await readStorefront("token");
    expect(hidden?.lines[0]?.salesPriceDirection ?? null).toBeNull();
    if (agreement) expect(hidden?.lines[0]?.unitPrice).toBe(900);
    if (market) expect(hidden?.lines[0]?.unitPrice).toBeNull();
    expect(seen.some(path => path.includes("&version=eq."))).toBe(false);
  }
  expect(line.price).toBe(1200);
});
