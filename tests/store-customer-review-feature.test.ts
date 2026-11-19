import { afterEach, expect, it } from "vitest";

import { storeCustomerReviewEnabled } from "../lib/store/07-store-customer-review-feature";

const company = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  delete process.env.CUSTOMER_STORE_REVIEW_ENABLED;
  delete process.env.FEATURE_CUSTOMER_STORE_REVIEW_COMPANY_IDS;
});

it("전역 스위치와 회사 allowlist가 모두 맞을 때만 켠다", () => {
  process.env.FEATURE_CUSTOMER_STORE_REVIEW_COMPANY_IDS = company;
  expect(storeCustomerReviewEnabled(company)).toBe(false);
  process.env.CUSTOMER_STORE_REVIEW_ENABLED = "true";
  expect(storeCustomerReviewEnabled(company)).toBe(true);
  expect(storeCustomerReviewEnabled("00000000-0000-4000-8000-000000000002")).toBe(false);
});
