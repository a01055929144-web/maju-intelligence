import { describe, expect, it } from "vitest";
import { buildBillingAttemptKey, getBillingRecoveryState, getKstUsageMonth, recommendBillingPlan, resolvePlanCodeForBilling, type BillingPlan } from "../domains/billing/subscription-plan";

const plans: BillingPlan[] = [
  { active: true, code: "starter", monthlyAmountWon: 30000, monthlyLeadLimit: 100, name: "시작", staffLimit: 3 },
  { active: true, code: "growth", monthlyAmountWon: 60000, monthlyLeadLimit: 300, name: "성장", staffLimit: 10 },
  { active: true, code: "scale", monthlyAmountWon: 100000, monthlyLeadLimit: null, name: "확장", staffLimit: null }
];

describe("WO-8 billing plan policy", () => {
  it("recommends the smallest active plan that covers average monthly leads", () => {
    expect(recommendBillingPlan(plans, 99.2)?.code).toBe("starter");
    expect(recommendBillingPlan(plans, 99.2)?.monthlyAmountWon).toBe(30000);
    expect(recommendBillingPlan(plans, 101)?.code).toBe("growth");
    expect(recommendBillingPlan(plans, 900)?.code).toBe("scale");
  });

  it("uses the KST month boundary for usage and billing", () => {
    expect(getKstUsageMonth(new Date("2026-10-31T14:59:59Z"))).toBe("2026-10-01");
    expect(getKstUsageMonth(new Date("2026-10-31T15:00:00Z"))).toBe("2026-11-01");
  });

  it("builds a stable key for one subscription, billing month, and retry attempt", () => {
    expect(buildBillingAttemptKey("sub-1", "2026-11-01", 0)).toBe(buildBillingAttemptKey("sub-1", "2026-11-01", 0));
    expect(buildBillingAttemptKey("sub-1", "2026-11-01", 1)).not.toBe(buildBillingAttemptKey("sub-1", "2026-11-01", 0));
  });

  it("applies a scheduled plan only at the next billing boundary", () => {
    expect(resolvePlanCodeForBilling("starter", "growth")).toBe("growth");
    expect(resolvePlanCodeForBilling("starter", null)).toBe("starter");
  });

  it("retries on days 1, 3, and 5 before a seven-day grace period ends", () => {
    expect(getBillingRecoveryState("2026-10-01", 0, new Date("2026-10-01T12:00:00Z"))).toMatchObject({ nextRetryDate: "2026-10-02", graceUntil: "2026-10-08", readOnly: false });
    expect(getBillingRecoveryState("2026-10-01", 1, new Date("2026-10-03T12:00:00Z"))).toMatchObject({ nextRetryDate: "2026-10-04", readOnly: false });
    expect(getBillingRecoveryState("2026-10-01", 3, new Date("2026-10-09T12:00:00Z"))).toMatchObject({ nextRetryDate: null, readOnly: true });
  });
});
