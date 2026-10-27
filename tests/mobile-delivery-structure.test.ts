import { describe, expect, it } from "vitest";
import { DELIVERY_ACTIONS, DELIVERY_EVENT_STATUSES, DELIVERY_OCCURRENCE_STAGES } from "../domains/delivery/issue-causes";

describe("mobile delivery structured fields", () => {
  it("matches the N1 stage, action, and status contract", () => {
    expect(DELIVERY_OCCURRENCE_STAGES.map((item) => item.value)).toEqual(["receiving", "storage", "loading", "transit", "unloading"]);
    expect(DELIVERY_ACTIONS.map((item) => item.value)).toEqual(["redelivery", "exchange", "deduction", "supplier_claim"]);
    expect(DELIVERY_EVENT_STATUSES.map((item) => item.value)).toEqual(["received", "in_progress", "completed"]);
  });
});
