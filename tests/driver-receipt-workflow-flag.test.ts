import { afterEach, expect, it } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";

afterEach(() => {
  delete process.env.FEATURE_DRIVER_RECEIPT_WORKFLOW;
  delete process.env.FEATURE_DRIVER_RECEIPT_WORKFLOW_COMPANY_IDS;
});

it("CX-46d 기사 수령 연결은 기본 OFF이고 회사 allowlist에서만 열린다", () => {
  expect(isFeatureEnabled("DRIVER_RECEIPT_WORKFLOW", "company-a")).toBe(false);
  process.env.FEATURE_DRIVER_RECEIPT_WORKFLOW_COMPANY_IDS = "company-b";
  expect(isFeatureEnabled("DRIVER_RECEIPT_WORKFLOW", "company-a")).toBe(false);
  expect(isFeatureEnabled("DRIVER_RECEIPT_WORKFLOW", "company-b")).toBe(true);
});
