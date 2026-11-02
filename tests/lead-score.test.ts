import { describe, expect, it } from "vitest";
import { computeLeadScore, DEFAULT_LEAD_SCORE_SETTINGS } from "../domains/lead/lead-score";

const baseLead = {
  hasPhone: false,
  industryKnown: true,
  isTarget: true,
  leadPeriod: "month" as const,
};

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
});
