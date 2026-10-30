import { expect, it, vi } from "vitest";
const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
vi.mock("@/lib/feature-modules", () => ({ areHoldModulesEnabled: () => true }));
vi.mock(
  "@/domains/order/order-rules",
  () => import("../domains/order/order-rules"),
);
vi.mock("../lib/pricing/store-link-token", () => ({
  verifyStoreLinkToken: () => ({ id: "link", hash: "hash" }),
}));
import { readStorefront } from "../lib/pricing/storefront";
it("matches the newest contract by product AND sales unit consistently with ordering", async () => {
  const seen: string[] = [];
  db.mockImplementation(async (path: string) => {
    seen.push(path);
    if (path.startsWith("storefront_links?"))
      return [
        {
          id: "link",
          company_id: "company",
          customer_id: "customer",
          document_version_id: "version",
          expires_at: "2099-12-31",
          revoked_at: null,
          can_order: true,
        },
      ];
    if (path.startsWith("pricing_document_versions?"))
      return [
        {
          id: "version",
          version: 1,
          content: {
            showPrice: true,
            validUntil: "2099-12-31",
            lines: [
              {
                productId: "product",
                unit: "개",
                visible: true,
                price: 1200,
                taxType: "exempt",
              },
            ],
          },
        },
      ];
    if (path.startsWith("normalized_customers?"))
      return [
        {
          id: "customer",
          customer_name: "store",
          delivery_territory_id: "territory",
        },
      ];
    if (path.startsWith("product_catalog?"))
      return [{ id: "product", is_active: true, order_pricing_mode: "fixed" }];
    if (path.startsWith("store_order_territory_rules?"))
      return [
        { delivery_weekdays: [0, 1, 2, 3, 4, 5, 6], cutoff_time: "23:59:00" },
      ];
    if (path.startsWith("customer_price_agreements?"))
      return [
        {
          product_catalog_id: "product",
          sales_unit: "개",
          unit_price: 900,
          tax_type: "exempt",
          price_includes_tax: false,
        },
        {
          product_catalog_id: "product",
          sales_unit: "박스",
          unit_price: 50000,
          tax_type: "taxable",
          price_includes_tax: true,
        },
        {
          product_catalog_id: "product",
          sales_unit: "개",
          unit_price: 800,
          tax_type: "taxable",
          price_includes_tax: true,
        },
      ];
    return [];
  });
  const store = await readStorefront("token", "2099-01-01");
  expect(store?.policy.cutoffTime).toBe("23:59");
  expect(store?.lines[0]).toMatchObject({
    unitPrice: 900,
    taxType: "exempt",
    priceIncludesTax: false,
  });
  expect(
    seen.find((path) => path.startsWith("customer_price_agreements?")),
  ).toContain("order=effective_from.desc,id.desc");
});
