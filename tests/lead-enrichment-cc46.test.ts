import { afterEach, describe, expect, it, vi } from "vitest";
import { isIndustryUnsettled, isLeadGoogleEnrichmentEnabled } from "../lib/store";

// CC-46-2: 구글 유료 호출은 스위치 OFF가 기본, 업종 보정은 빈 값·미분류·기타만.
describe("lead enrichment switches", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Google enrichment is off unless LEAD_ENRICH_GOOGLE is exactly true", () => {
    expect(isLeadGoogleEnrichmentEnabled()).toBe(false);
    vi.stubEnv("LEAD_ENRICH_GOOGLE", "1");
    expect(isLeadGoogleEnrichmentEnabled()).toBe(false);
    vi.stubEnv("LEAD_ENRICH_GOOGLE", "true");
    expect(isLeadGoogleEnrichmentEnabled()).toBe(true);
  });

  it("only empty, 미분류 and 기타 industries may be overwritten by the Kakao category", () => {
    for (const unsettled of [null, undefined, "", "미분류", "기타"]) expect(isIndustryUnsettled(unsettled)).toBe(true);
    for (const settled of ["한식", "카페/디저트", "주점"]) expect(isIndustryUnsettled(settled)).toBe(false);
  });
});
