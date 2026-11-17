import { afterEach, describe, expect, it, vi } from "vitest";
import { computeLeadScore, DEFAULT_LEAD_SCORE_SETTINGS, NEW_STORE_PRIORITY_BONUS, VISIT_NEEDED_PRIORITY_BONUS } from "../domains/lead/lead-score";
import { isFeatureEnabled } from "../lib/feature-flags";

const baseLead = {
  hasPhone: false,
  industryKnown: true,
  isTarget: true,
  leadPeriod: "month" as const,
};

afterEach(() => vi.unstubAllEnvs());

describe("computeLeadScore", () => {
  it("gives a matched Kakao phone priority over the same lead without a phone", () => {
    const withoutPhone = computeLeadScore({ ...baseLead, kakaoMatched: true });
    const withPhone = computeLeadScore({ ...baseLead, kakaoMatched: true, kakaoPhone: "02-123-4567" });

    expect(withPhone.total).toBeGreaterThan(withoutPhone.total);
    expect(withPhone.breakdown.contactability_score).toBe(35);
    expect(withPhone.reasons).toContain("카카오 연락처 ✓");
  });

  it("applies the 35/20/15/15/15 defaults and A75/B55/C35 thresholds", () => {
    expect(DEFAULT_LEAD_SCORE_SETTINGS.weights).toEqual({ contactability: 35, freshness: 20, industryFit: 15, storeSize: 15, activity: 15 });
    expect(DEFAULT_LEAD_SCORE_SETTINGS.gradeThresholds).toEqual({ A: 75, B: 55, C: 35 });

    const result = computeLeadScore({
      ...baseLead,
      hasPhone: true,
      kakaoMatched: true,
      kakaoPhone: "010-1234-5678",
      keywordVolume: 70,
      leadPeriod: "today",
      rating: 5,
      reviewCount: 100,
      storeAreaSqm: 50 * 3.3058,
    });

    expect(result.breakdown).toEqual({ contactability_score: 35, freshness_score: 20, industry_fit_score: 15, store_size_score: 15, activity_score: 15 });
    expect(result).toMatchObject({ total: 100, grade: "A" });
  });

  it("uses supplied weights and grade thresholds without mutating defaults", () => {
    const result = computeLeadScore(
      { ...baseLead, hasPhone: true, storeAreaSqm: 15 * 3.3058 },
      { weights: { contactability: 50, freshness: 10, industryFit: 10, storeSize: 10, activity: 20 }, gradeThresholds: { A: 90, B: 60, C: 30 } },
    );

    expect(result.breakdown.contactability_score).toBe(14);
    expect(result.grade).toBe("C");
    expect(DEFAULT_LEAD_SCORE_SETTINGS.weights.contactability).toBe(35);
  });

  it("adds visit priority only after every configured search failed", () => {
    const ordinary = computeLeadScore(baseLead);
    const visit = computeLeadScore({
      ...baseLead,
      searchStatuses: { instagram: "not_found", place: "not_found", web: "not_found" },
      visitNeededBonusEnabled: true,
    });

    expect(visit.visitNeeded).toBe(true);
    expect(visit.breakdown.visit_needed_score).toBe(VISIT_NEEDED_PRIORITY_BONUS);
    expect(visit.total).toBe(ordinary.total + VISIT_NEEDED_PRIORITY_BONUS);
    expect(visit.reasons).toContain("검색 안 됨 → 방문");
  });

  it("does not mark a lead before all searches finish or while the feature is off", () => {
    const incomplete = computeLeadScore({
      ...baseLead,
      searchStatuses: { instagram: "not_found", place: "not_found", web: "not_searched" },
      visitNeededBonusEnabled: true,
    });
    const disabled = computeLeadScore({
      ...baseLead,
      searchStatuses: { instagram: "not_found", place: "not_found", web: "not_found" },
    });

    expect(incomplete).toMatchObject({ visitNeeded: false, total: computeLeadScore(baseLead).total });
    expect(disabled).toMatchObject({ visitNeeded: false, total: computeLeadScore(baseLead).total });
    expect(incomplete.breakdown).not.toHaveProperty("visit_needed_score");
    expect(disabled.reasons).not.toContain("검색 안 됨 → 방문");
  });

  it("keeps visit priority default-off and scoped to the company allowlist", () => {
    expect(isFeatureEnabled("LEAD_VISIT_NEEDED_PRIORITY", "company-a")).toBe(false);
    vi.stubEnv("FEATURE_LEAD_VISIT_NEEDED_PRIORITY_COMPANY_IDS", "company-b, company-a");
    expect(isFeatureEnabled("LEAD_VISIT_NEEDED_PRIORITY", "company-a")).toBe(true);
    expect(isFeatureEnabled("LEAD_VISIT_NEEDED_PRIORITY", "company-c")).toBe(false);
  });

  it.each([
    ["2026-10-02", 30, NEW_STORE_PRIORITY_BONUS.within30Days],
    ["2026-10-01", 31, NEW_STORE_PRIORITY_BONUS.within90Days],
    ["2026-08-03", 90, NEW_STORE_PRIORITY_BONUS.within90Days],
  ])("adds the new-store bonus at the 30/90 day boundaries", (openDate, ageDays, bonus) => {
    const ordinary = computeLeadScore(baseLead);
    const result = computeLeadScore({ ...baseLead, openDate, scoreDate: "2026-11-01", newStoreBonusEnabled: true });

    expect(result).toMatchObject({ newStoreAgeDays: ageDays, total: ordinary.total + bonus });
    expect(result.breakdown.new_store_score).toBe(bonus);
    expect(result.reasons).toContain(`개업 ${ageDays}일`);
  });

  it.each([undefined, "2026-08-02", "2026-11-02", "not-a-date"])("does not score an unknown, old, future, or invalid opening date: %s", (openDate) => {
    const result = computeLeadScore({ ...baseLead, openDate, scoreDate: "2026-11-01", newStoreBonusEnabled: true });
    expect(result).not.toHaveProperty("newStoreAgeDays");
    expect(result.breakdown).not.toHaveProperty("new_store_score");
  });

  it("uses the permit date only when the opening date is missing and remains default-off", () => {
    const disabled = computeLeadScore({ ...baseLead, permitDate: "2026-10-20", scoreDate: "2026-11-01" });
    const enabled = computeLeadScore({ ...baseLead, permitDate: "2026-10-20", scoreDate: "2026-11-01", newStoreBonusEnabled: true });
    expect(disabled.breakdown).not.toHaveProperty("new_store_score");
    expect(enabled).toMatchObject({ newStoreAgeDays: 12 });
    expect(enabled.breakdown.new_store_score).toBe(NEW_STORE_PRIORITY_BONUS.within30Days);
  });

  it("scopes new-store priority to the company allowlist", () => {
    expect(isFeatureEnabled("LEAD_NEW_STORE_PRIORITY", "company-a")).toBe(false);
    vi.stubEnv("FEATURE_LEAD_NEW_STORE_PRIORITY_COMPANY_IDS", "company-a");
    expect(isFeatureEnabled("LEAD_NEW_STORE_PRIORITY", "company-a")).toBe(true);
    expect(isFeatureEnabled("LEAD_NEW_STORE_PRIORITY", "company-b")).toBe(false);
  });
});
