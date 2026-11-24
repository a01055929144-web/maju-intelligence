import { afterEach, expect, it } from "vitest";
import { signupIncompleteReviewEnabled } from "../lib/store/signup-incomplete-review-feature";

const company = "00000000-0000-4000-8000-000000000001";
const oldEnabled = process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_ENABLED;
const oldCompanies = process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_COMPANY_IDS;
afterEach(() => {
  if (oldEnabled === undefined) delete process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_ENABLED; else process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_ENABLED = oldEnabled;
  if (oldCompanies === undefined) delete process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_COMPANY_IDS; else process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_COMPANY_IDS = oldCompanies;
});

it("requires both the default-off switch and company allowlist", () => {
  delete process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_ENABLED;
  process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_COMPANY_IDS = company;
  expect(signupIncompleteReviewEnabled(company)).toBe(false);
  process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_ENABLED = "true";
  expect(signupIncompleteReviewEnabled(company)).toBe(true);
  expect(signupIncompleteReviewEnabled("00000000-0000-4000-8000-000000000002")).toBe(false);
});
