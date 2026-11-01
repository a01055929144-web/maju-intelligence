import { describe, expect, it, vi } from "vitest";
import { createPartnerPaymentAttempt } from "../domains/erp/payment-attempt";

describe("partner payment idempotency", () => {
  it("creates one stable key for a logical registration payload", () => {
    const createKey = vi.fn(() => "payment-attempt-1");
    const attempt = createPartnerPaymentAttempt({
      companyId: "company-1",
      partnerType: "customer",
      partnerId: "customer-1",
      entryDate: "2026-11-01",
      amount: 1000,
      paymentMethod: "bank",
    }, createKey);

    expect(createKey).toHaveBeenCalledTimes(1);
    expect(attempt.idempotencyKey).toBe("payment-attempt-1");
    expect(JSON.stringify(attempt)).toContain('"idempotencyKey":"payment-attempt-1"');
  });
});
