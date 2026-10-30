import { describe, expect, it } from "vitest";
import { toPublicStorefront } from "../lib/pricing/storefront-public";

describe("store link public response", () => {
  it("never copies staff scope, supplier, cost, or margin fields", () => {
    const internal = {
      linkId: "private-link", companyId: "private-company",
      customerId: "private-customer", documentVersionId: "private-version",
      cost: 1200, margin: 25, supplierName: "private supplier",
      version: 1, title: "단가표", companyName: "회사", footer: "",
      customerName: "매장", deliveryAddress: "주소", validUntil: "2026-12-31",
      priceAvailable: true, canOrder: true, nextDeliveryDate: "2026-11-02",
      selectedDeliveryDate: "2026-11-02", notice: "", marketPriceNotice: "",
      policy: { weekdays: [1], cutoffDaysBefore: 1, cutoffTime: "22:00",
        minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0, holidays: [] },
      lines: [{ key: "item", productId: "product", promotionId: null,
        name: "상품", brand: "", spec: "", unit: "개", badge: "",
        startsOn: null, endsOn: null, remaining: null, taxType: "exempt",
        unitPrice: 1500, priceIncludesTax: false, isMarketPrice: false,
        maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null,
        purchaseCost: 1200, marginPercent: 25, supplierName: "private supplier" }],
    } as unknown as Parameters<typeof toPublicStorefront>[0];
    const result = JSON.stringify(toPublicStorefront(internal));
    for (const privateValue of ["private-link", "private-company", "private-customer",
      "private-version", "private supplier", "purchaseCost", "marginPercent"])
      expect(result).not.toContain(privateValue);
  });
});
