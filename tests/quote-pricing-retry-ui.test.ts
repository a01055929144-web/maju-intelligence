import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isQuotePricingPending } from "../lib/quote-pricing-retry";

describe("quote pricing retry entry points", () => {
  it("shows retry only for accepted customer quotes without pricing application", () => {
    expect(isQuotePricingPending({ status: "accepted", customerId: "customer-1" })).toBe(true);
    expect(isQuotePricingPending({ status: "accepted", customerId: "customer-1", pricingAppliedAt: "2026-10-16T00:00:00Z" })).toBe(false);
    expect(isQuotePricingPending({ status: "accepted" })).toBe(false);
    expect(isQuotePricingPending({ status: "sent", customerId: "customer-1" })).toBe(false);
  });

  it("keeps the RPC already-applied response as a successful terminal state", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/sales-quotes/[id]/accept/route.ts"), "utf8");
    expect(source).toContain("result.alreadyApplied");
    expect(source).toContain("이미 계약 단가가 반영된 견적입니다.");
  });
});
