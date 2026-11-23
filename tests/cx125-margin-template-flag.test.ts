import { afterEach, expect, it, vi } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";

afterEach(() => vi.unstubAllEnvs());

it("CX-125 카탈로그 카드는 기본 OFF이고 회사 allowlist에서만 열린다", () => {
  vi.stubEnv("MARGIN_TEMPLATES_ENABLED", "false");
  vi.stubEnv("FEATURE_MARGIN_TEMPLATES", "false");
  vi.stubEnv("FEATURE_MARGIN_TEMPLATES_COMPANY_IDS", "");
  expect(isFeatureEnabled("MARGIN_TEMPLATES", "company-a")).toBe(false);

  vi.stubEnv("FEATURE_MARGIN_TEMPLATES_COMPANY_IDS", "company-a");
  expect(isFeatureEnabled("MARGIN_TEMPLATES", "company-a")).toBe(true);
  expect(isFeatureEnabled("MARGIN_TEMPLATES", "company-b")).toBe(false);
});
