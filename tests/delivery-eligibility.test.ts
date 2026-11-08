import { describe, expect, it } from "vitest";
import { isCustomerEligibleForTodayRoute } from "../domains/route/delivery-eligibility";

describe("today route delivery eligibility", () => {
  it("preserves every existing route candidate while the rollout is off", () => {
    expect(isCustomerEligibleForTodayRoute(undefined, false)).toBe(true);
    expect(isCustomerEligibleForTodayRoute("not_ready", false)).toBe(true);
  });

  it("requires explicit eligibility after rollout", () => {
    expect(isCustomerEligibleForTodayRoute(undefined, true)).toBe(false);
    expect(isCustomerEligibleForTodayRoute("not_ready", true)).toBe(false);
    expect(isCustomerEligibleForTodayRoute("eligible", true)).toBe(true);
  });
});
