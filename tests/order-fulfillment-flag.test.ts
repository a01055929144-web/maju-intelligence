import { afterEach, describe, expect, it } from "vitest";
import { orderFulfillmentEnabled } from "../lib/order-fulfillment-feature";

describe("ORDER_FULFILLMENT rollout", () => {
  afterEach(() => { delete process.env.ORDER_FULFILLMENT; delete process.env.ORDER_FULFILLMENT_COMPANY_IDS; });
  it("is off unless both the switch and company allowlist match", () => {
    process.env.ORDER_FULFILLMENT_COMPANY_IDS = "company-a";
    expect(orderFulfillmentEnabled("company-a")).toBe(false);
    process.env.ORDER_FULFILLMENT = "true";
    expect(orderFulfillmentEnabled("company-b")).toBe(false);
    expect(orderFulfillmentEnabled("company-a")).toBe(true);
  });
});
