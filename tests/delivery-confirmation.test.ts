import { expect, it } from "vitest";
import { needsDeliveryConfirmation } from "../domains/order/delivery-confirmation";
import { summarizeOrder, type DeliveryPolicy } from "../domains/order/order-rules";
it("uses configured scheduling and otherwise requests delivery confirmation", () => {
  expect(needsDeliveryConfirmation(true,[1,3])).toBe(false);
  expect(needsDeliveryConfirmation(true,[])).toBe(true);
  expect(needsDeliveryConfirmation(false,[1])).toBe(true);
});
it("preserves commercial minimum rules while scheduling is pending", () => {
  const policy: DeliveryPolicy = { weekdays: [], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 2000, minimumPolicy: "block", deliveryFee: 0 };
  const line = { productId: "product", quantity: 1, unitPrice: 1000, taxType: "exempt" as const };
  expect(summarizeOrder([line],policy,true).canSubmit).toBe(false);
  expect(summarizeOrder([line],{...policy,minimumAmount:0},true).knownTotal).toBe(1000);
  expect(() => summarizeOrder([line],policy)).toThrow("배송 요일");
});
