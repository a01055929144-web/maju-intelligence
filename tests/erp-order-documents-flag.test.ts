import { afterEach, expect, it } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";

afterEach(() => {
  delete process.env.FEATURE_ERP_ORDER_DOCUMENTS;
  delete process.env.FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS;
});

it("E 주문 전표·수령 확인은 기본 OFF이고 회사 allowlist에서만 열린다", () => {
  expect(isFeatureEnabled("ERP_ORDER_DOCUMENTS", "company-a")).toBe(false);
  process.env.FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS = "company-b,company-a";
  expect(isFeatureEnabled("ERP_ORDER_DOCUMENTS", "company-a")).toBe(true);
  expect(isFeatureEnabled("ERP_ORDER_DOCUMENTS", "company-c")).toBe(false);
});
