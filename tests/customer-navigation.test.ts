import { describe, expect, it } from "vitest";

import { customerNavigationGroups, flattenCustomerNavigationItems } from "../lib/customer-navigation";

describe("customer navigation", () => {
  it("keeps the same leaf destinations after grouping the growth navigation", () => {
    const growth = customerNavigationGroups.find((group) => group.label === "성장");
    const flattened = flattenCustomerNavigationItems(growth ? [growth] : []);

    expect(flattened.map(({ active, href }) => `${active}:${href}`)).toEqual([
      "revenue:/revenue/pipeline",
      "sales-contacts:/revenue/contacts",
      "product-catalog:/revenue/products",
      "sales-performance:/sales/performance",
      "dashboard:/dashboard?view=leads&leadType=permit",
      "dashboard:/dashboard?view=leads&leadType=keyword",
      "revenue-ledger:/revenue/transactions",
      "billing:/revenue/billing",
      "assistant:/assistant",
      "report:/reports/latest"
    ]);
  });

  it("groups growth destinations into four sidebar sections", () => {
    const growth = customerNavigationGroups.find((group) => group.label === "성장");

    expect(growth?.items.map((item) => item.label)).toEqual(["영업 관리", "리드", "매출", "AI"]);
    expect(growth?.items.map((item) => item.children?.length)).toEqual([4, 2, 2, 2]);
  });
});
