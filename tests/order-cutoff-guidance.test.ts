import { afterEach, expect, it, vi } from "vitest";
import { orderCutoffGuidance } from "../domains/order/order-cutoff-guidance";
import type { DeliveryPolicy } from "../domains/order/order-rules";
import { storeOrderCutoffGuidanceEnabled } from "../lib/pricing/store-order-cutoff-feature";

const policy: DeliveryPolicy = { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 };
afterEach(() => vi.unstubAllEnvs());

it("uses the selected delivery date's KST cutoff and closes exactly at the boundary", () => {
  const before = orderCutoffGuidance("2026-11-19", policy, new Date("2026-11-18T12:59:00Z"));
  expect(before.open).toBe(true);
  expect(before.label).toBe("2026-11-18 22:00 마감 (한국시간)");
  expect(before.message).toContain("1분 남음");
  expect(orderCutoffGuidance("2026-11-19", policy, new Date("2026-11-18T13:00:00Z"))).toMatchObject({ open: false, message: expect.stringContaining("주문 마감이 지났습니다") });
});

it("does not call holidays or non-delivery weekdays open, and fails closed on malformed settings", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  expect(orderCutoffGuidance("2026-11-19", { ...policy, holidays: [{ kind: "date", date: "2026-11-19" }] }, now).open).toBe(false);
  expect(orderCutoffGuidance("2026-11-19", { ...policy, weekdays: [0] }, now).open).toBe(false);
  expect(orderCutoffGuidance("bad-day", policy, now).open).toBe(false);
  expect(orderCutoffGuidance("2026-11-19", { ...policy, cutoffTime: "25:00" }, now).open).toBe(false);
});

it("handles prior-month and two-day cutoffs without changing policy amounts", () => {
  const input = { ...policy, cutoffDaysBefore: 2 as const, minimumAmount: 30000, minimumPolicy: "fee" as const, deliveryFee: 3000 };
  expect(orderCutoffGuidance("2027-01-01", input, new Date("2026-12-29T00:00:00Z")).label).toBe("2026-12-30 22:00 마감 (한국시간)");
  expect(input.minimumAmount).toBe(30000); expect(input.deliveryFee).toBe(3000);
});

it("defaults OFF and requires both explicit activation and the verified company allowlist", () => {
  vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_ENABLED", ""); vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_COMPANY_IDS", "company-a");
  expect(storeOrderCutoffGuidanceEnabled("company-a")).toBe(false);
  vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_ENABLED", "true"); vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_COMPANY_IDS", "");
  expect(storeOrderCutoffGuidanceEnabled("company-a")).toBe(false);
  vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_COMPANY_IDS", " company-a ");
  expect(storeOrderCutoffGuidanceEnabled("company-a")).toBe(true);
  expect(storeOrderCutoffGuidanceEnabled("company-b")).toBe(false);
  expect(storeOrderCutoffGuidanceEnabled("")).toBe(false);
});
