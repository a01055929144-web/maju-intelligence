import { describe, expect, it } from "vitest";

import { customerNavigationGroups, flattenCustomerNavigationItems } from "../lib/customer-navigation";

describe("customer navigation", () => {
  it("keeps the confirmed ERP-oriented sidebar groups", () => {
    expect(customerNavigationGroups.map((group) => group.label)).toEqual(["영업", "거래처", "전표·정산", "상품·재고", "배송", "설정"]);
  });

  it("keeps sales, supplier, customer, product and logistics destinations reachable", () => {
    const flattened = flattenCustomerNavigationItems();

    expect(flattened.map((item) => item.href)).toEqual(expect.arrayContaining([
      "/dashboard?view=leads&leadType=permit", "/dashboard?view=leads&leadType=keyword", "/assistant",
      "/revenue/pipeline", "/revenue/contacts", "/sales/performance", "/purchasing/suppliers",
      "/crm/timeline", "/revenue/transactions", "/revenue/products", "/revenue/products?tab=mapping",
      "/operations/documents", "/operations/documents?tab=ledger", "/operations/inventory",
      "/dashboard", "/routes/today", "/dashboard?view=history", "/dashboard/settings?section=tms#territory-settings"
    ]));
  });

  it("does not duplicate an exact navigation destination", () => {
    const identities = flattenCustomerNavigationItems().map((item) => `${item.active}:${item.href}`);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("does not expose the future group messaging placeholder", () => {
    expect(flattenCustomerNavigationItems().map((item) => item.label)).not.toContain("단체메시지");
  });
});
