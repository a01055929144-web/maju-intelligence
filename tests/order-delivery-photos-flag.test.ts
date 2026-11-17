import { afterEach, expect, it } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";

afterEach(() => {
  delete process.env.FEATURE_DELIVERY_ORDER_PHOTOS;
  delete process.env.FEATURE_DELIVERY_ORDER_PHOTOS_COMPANY_IDS;
});

it("CX-53 주문별 배송 사진은 기본 OFF이고 회사 allowlist에서만 열린다", () => {
  expect(isFeatureEnabled("DELIVERY_ORDER_PHOTOS", "company-a")).toBe(false);
  process.env.FEATURE_DELIVERY_ORDER_PHOTOS_COMPANY_IDS = "company-b";
  expect(isFeatureEnabled("DELIVERY_ORDER_PHOTOS", "company-a")).toBe(false);
  expect(isFeatureEnabled("DELIVERY_ORDER_PHOTOS", "company-b")).toBe(true);
});
