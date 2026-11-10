import { describe, expect, it } from "vitest";
import { toPublicStorefront } from "../lib/pricing/storefront-public";

describe("store link public response", () => {
  it("never copies staff scope, supplier, cost, or margin fields", () => {
    const internal = {
      linkId: "private-link",
      companyId: "private-company",
      customerId: "private-customer",
      documentVersionId: "private-version",
      cost: 1200,
      margin: 25,
      supplierName: "private supplier",
      accessPassword: "private entrance code",
      objectKey: "private object path",
      envelope: { ciphertext: "private ciphertext" },
      onboardingFiles: ["private registration"],
      businessRegistrationFile: "private document URL",
      version: 1,
      title: "단가표",
      companyName: "회사",
      footer: "",
      customerName: "매장",
      deliveryAddress: "주소",
      validUntil: "2026-12-31",
      priceAvailable: true,
      canOrder: true,
      deliveryEligibility: { eligible: true, reason: "eligible", territoryId: "private-territory-id", territoryName: "test area", weekdays: [1] },
      nextDeliveryDate: "2026-11-02",
      selectedDeliveryDate: "2026-11-02",
      notice: "",
      marketPriceNotice: "",
      policy: {
        weekdays: [1],
        cutoffDaysBefore: 1,
        cutoffTime: "22:00",
        minimumAmount: 0,
        minimumPolicy: "notice",
        deliveryFee: 0,
        holidays: [],
      },
      lines: [
        {
          key: "item",
          productId: "product",
          promotionId: null,
          name: "상품",
          brand: "",
          spec: "",
          unit: "개",
          badge: "",
          startsOn: null,
          endsOn: null,
          remaining: null,
          taxType: "exempt",
          unitPrice: 1500,
          priceIncludesTax: false,
          isMarketPrice: false,
          maximumQuantity: null,
          recentDispatchPrice: null,
          recentDispatchDate: null,
          salesPriceDirection: "up",
          purchaseCostDirection: "down",
          purchaseCost: 1200,
          marginPercent: 25,
          supplierName: "private supplier",
          purchaseCostChange: 125,
          purchaseCostChangePercent: 12.5,
          purchaseDate: "private purchase date",
          supplierCostTrend: { current: 1200, previous: 1075 },
          storeCostTrend: [{ cost: 900 }],
          loadingPhoto: "private loading photo",
          internalMemo: "private staff memo",
        },
      ],
    } as unknown as Parameters<typeof toPublicStorefront>[0];
    expect(toPublicStorefront(internal).lines[0].salesPriceDirection).toBe("up");
    for (const value of ["down", "flat", { direction: "up", cost: 900 }, null, "unknown"]) {
      Object.assign(internal.lines[0], { salesPriceDirection: value });
      expect(toPublicStorefront(internal).lines[0].salesPriceDirection).toBe(value === "down" || value === "flat" ? value : undefined);
    }
    const result = JSON.stringify(toPublicStorefront(internal));
    for (const privateValue of [
      "private-link",
      "private-company",
      "private-customer",
      "private-version",
      "private supplier",
      "purchaseCost",
      "purchaseCostDirection",
      "marginPercent",
      "private object path",
      "private-territory-id",
      "private ciphertext",
      "private registration",
      "private entrance code",
      "private document URL",
      "private loading photo",
      "private staff memo",
      "purchaseCostChange",
      "purchaseDate",
      "supplierCostTrend",
      "storeCostTrend",
    ])
      expect(result).not.toContain(privateValue);
  });
});
