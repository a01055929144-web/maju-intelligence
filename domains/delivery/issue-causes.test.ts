import { describe, expect, it } from "vitest";
import {
  DELIVERY_ACTIONS,
  DELIVERY_EVENT_STATUSES,
  DELIVERY_ISSUE_CAUSE_CODES,
  DELIVERY_ISSUE_CAUSES,
  DELIVERY_OCCURRENCE_STAGES,
  DELIVERY_RECORD_TYPES,
  requiresDeliveryIssueCause,
  requiresDeliveryItems
} from "./issue-causes";

describe("delivery structured event taxonomy", () => {
  it("keeps every persisted value unique", () => {
    for (const values of [DELIVERY_ACTIONS, DELIVERY_EVENT_STATUSES, DELIVERY_OCCURRENCE_STAGES, DELIVERY_RECORD_TYPES]) {
      expect(new Set(values.map(({ value }) => value)).size).toBe(values.length);
    }
    expect(new Set(DELIVERY_ISSUE_CAUSES).size).toBe(DELIVERY_ISSUE_CAUSES.length);
    expect(Object.keys(DELIVERY_ISSUE_CAUSE_CODES)).toEqual([...DELIVERY_ISSUE_CAUSES]);
    expect(new Set(Object.values(DELIVERY_ISSUE_CAUSE_CODES)).size).toBe(DELIVERY_ISSUE_CAUSES.length);
  });

  it("requires a cause for issue records and item details for non-arrival records", () => {
    expect(requiresDeliveryIssueCause("return")).toBe(true);
    expect(requiresDeliveryIssueCause("exchange")).toBe(true);
    expect(requiresDeliveryIssueCause("damage")).toBe(true);
    expect(requiresDeliveryIssueCause("missing")).toBe(true);
    expect(requiresDeliveryIssueCause("arrived")).toBe(false);
    expect(requiresDeliveryItems("arrived")).toBe(false);
    expect(requiresDeliveryItems("partial")).toBe(true);
  });
});
