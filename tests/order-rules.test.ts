import { describe, expect, it } from "vitest";
import {
  canOrderForDelivery,
  kstDateTime,
  nextDeliveryDate,
  summarizeOrder,
  type DeliveryPolicy,
} from "../domains/order/order-rules";

const policy: DeliveryPolicy = {
  weekdays: [1, 3, 5],
  cutoffDaysBefore: 1,
  cutoffTime: "22:00",
  minimumAmount: 30000,
  minimumPolicy: "fee",
  deliveryFee: 3000,
  holidays: [],
};

describe("store order calendar", () => {
  it("uses KST at midnight and rejects an expired delivery cutoff", () => {
    expect(kstDateTime(new Date("2026-10-26T15:30:00Z"))).toEqual({
      date: "2026-10-27",
      time: "00:30",
    });
    expect(canOrderForDelivery("2026-10-28", policy, new Date("2026-10-27T12:59:00Z"))).toBe(true);
    expect(canOrderForDelivery("2026-10-28", policy, new Date("2026-10-27T13:00:00Z"))).toBe(false);
  });

  it("skips weekly and one-off holidays", () => {
    const closed: DeliveryPolicy = {
      ...policy,
      holidays: [
        { kind: "weekly", weekday: 1 },
        { kind: "date", date: "2026-10-28" },
      ],
    };
    expect(nextDeliveryDate(closed, new Date("2026-10-25T12:00:00Z"))).toBe("2026-10-30");
  });
});

describe("postpay order totals", () => {
  it("rounds VAT per line and adds a minimum-order fee", () => {
    expect(summarizeOrder([
      { productId: "a", quantity: 1.5, unitPrice: 1001, taxType: "taxable" },
      { productId: "b", quantity: 2, unitPrice: 1000, taxType: "exempt" },
    ], policy)).toMatchObject({
      taxableSupply: 1502,
      exemptSupply: 2000,
      tax: 150,
      knownSubtotal: 3652,
      deliveryFee: 3000,
      knownTotal: 6652,
      canSubmit: true,
    });
  });

  it("keeps market-price lines unresolved without inventing a price", () => {
    const result = summarizeOrder([
      { productId: "a", quantity: 3, unitPrice: null, taxType: "taxable" },
    ], { ...policy, minimumPolicy: "block" });
    expect(result).toMatchObject({ marketCount: 1, totalIsEstimate: true, canSubmit: true });
  });

  it("extracts VAT from an existing tax-inclusive contract price", () => {
    const result = summarizeOrder([
      { productId: "a", quantity: 1, unitPrice: 1100, taxType: "taxable", priceIncludesTax: true },
    ], policy);
    expect(result).toMatchObject({ taxableSupply: 1000, tax: 100, knownSubtotal: 1100 });
  });

  it("blocks a known under-minimum order when configured", () => {
    const result = summarizeOrder([
      { productId: "a", quantity: 1, unitPrice: 1000, taxType: "exempt" },
    ], { ...policy, minimumPolicy: "block" });
    expect(result.canSubmit).toBe(false);
  });

  it("rejects an aggregate above the browser's exact integer range", () => {
    expect(() => summarizeOrder([
      { productId: "a", quantity: 5000, unitPrice: 1e12, taxType: "exempt" },
      { productId: "b", quantity: 5000, unitPrice: 1e12, taxType: "exempt" },
    ], policy)).toThrow("주문 금액이 너무 큽니다.");
  });
});
