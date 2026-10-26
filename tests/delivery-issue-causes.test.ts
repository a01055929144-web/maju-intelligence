import { describe, expect, it } from "vitest";
import { DELIVERY_ISSUE_CAUSES, DELIVERY_RECORD_TYPES, requiresDeliveryIssueCause, requiresDeliveryItems } from "../domains/delivery/issue-causes";

describe("mobile delivery record rules", () => {
  it("keeps the eight field record types in one delivery domain", () => {
    expect(DELIVERY_RECORD_TYPES.map((item) => item.label)).toEqual([
      "완료", "부분 배송", "반품", "보충", "교환", "파손", "누락", "기타"
    ]);
  });

  it("requires one shared cause for return, exchange, damage and missing records", () => {
    expect(DELIVERY_ISSUE_CAUSES).toContain("포장 불량");
    expect(requiresDeliveryIssueCause("return")).toBe(true);
    expect(requiresDeliveryIssueCause("exchange")).toBe(true);
    expect(requiresDeliveryIssueCause("damage")).toBe(true);
    expect(requiresDeliveryIssueCause("missing")).toBe(true);
    expect(requiresDeliveryIssueCause("partial")).toBe(false);
  });

  it("only allows a completed delivery without an item quantity", () => {
    expect(requiresDeliveryItems("arrived")).toBe(false);
    expect(requiresDeliveryItems("partial")).toBe(true);
    expect(requiresDeliveryItems("other")).toBe(true);
  });
});
