import { squareMetersToPyeong } from "./store-area";

export type LeadScoreGrade = "A" | "B" | "C" | null;

export type LeadScoreInput = {
  hasPhone: boolean;
  industryKnown: boolean;
  isTarget: boolean;
  kakaoMatched?: boolean;
  kakaoPhone?: string;
  keywordVolume?: number;
  leadPeriod: "today" | "week" | "month" | "older";
  phone?: string;
  rating?: number;
  reviewCount?: number;
  storeAreaSqm?: number | null;
  hasInstagram?: boolean;
  hasTalktalk?: boolean;
};

export type LeadScoreSettings = {
  gradeThresholds: { A: number; B: number; C: number };
  weights: {
    activity: number;
    contactability: number;
    freshness: number;
    industryFit: number;
    storeSize: number;
  };
};

export const DEFAULT_LEAD_SCORE_SETTINGS: LeadScoreSettings = {
  weights: { contactability: 35, freshness: 20, industryFit: 15, storeSize: 15, activity: 15 },
  gradeThresholds: { A: 75, B: 55, C: 35 },
};

export type LeadScoreResult = {
  breakdown: {
    activity_score: number;
    contactability_score: number;
    freshness_score: number;
    industry_fit_score: number;
    store_size_score: number;
  };
  grade: LeadScoreGrade;
  reasons: string[];
  total: number;
};

export function computeLeadScore(input: LeadScoreInput, settings: LeadScoreSettings = DEFAULT_LEAD_SCORE_SETTINGS): LeadScoreResult {
  const contactability = scoreContactability(input, settings.weights.contactability);
  const freshness = scale(({ today: 20, week: 15, month: 10, older: 4 } as const)[input.leadPeriod], 20, settings.weights.freshness);
  const industryFit = scale(!input.isTarget ? 0 : input.industryKnown ? 15 : 7, 15, settings.weights.industryFit);
  const storeSize = scoreStoreSize(input.storeAreaSqm, settings.weights.storeSize);
  const activity = scoreActivity(input, settings.weights.activity);
  const breakdown = {
    contactability_score: contactability,
    freshness_score: freshness,
    industry_fit_score: industryFit,
    store_size_score: storeSize,
    activity_score: activity,
  };
  const total = Object.values(breakdown).reduce((sum, score) => sum + score, 0);

  return {
    breakdown,
    total,
    grade: total >= settings.gradeThresholds.A ? "A" : total >= settings.gradeThresholds.B ? "B" : total >= settings.gradeThresholds.C ? "C" : null,
    reasons: buildReasons(input),
  };
}

function scoreContactability(input: LeadScoreInput, weight: number) {
  const matchedPhone = input.kakaoPhone?.trim();
  let score = input.kakaoMatched ? matchedPhone ? 35 : 15 : input.hasPhone ? 10 : 0;
  const phone = matchedPhone || input.phone?.trim();
  if (phone?.replace(/\D/g, "").startsWith("010")) score += 5;
  if (input.hasInstagram || input.hasTalktalk) score += 5;
  return scale(Math.min(score, 35), 35, weight);
}

function scoreStoreSize(storeAreaSqm: number | null | undefined, weight: number) {
  const pyeong = squareMetersToPyeong(storeAreaSqm);
  const score = pyeong === undefined ? 0 : pyeong >= 50 ? 15 : pyeong >= 30 ? 11 : pyeong >= 15 ? 7 : 3;
  return scale(score, 15, weight);
}

function scoreActivity(input: LeadScoreInput, weight: number) {
  const keyword = typeof input.keywordVolume === "number" && input.keywordVolume > 0 ? Math.min(7, Math.round(input.keywordVolume / 10)) : 0;
  const rating = typeof input.rating === "number" && input.rating > 0 ? Math.round((Math.min(input.rating, 5) / 5) * 4) : 0;
  const reviews = typeof input.reviewCount === "number" && input.reviewCount > 0 ? Math.min(4, Math.round(Math.log10(input.reviewCount + 1) * 2)) : 0;
  return scale(keyword + rating + reviews, 15, weight);
}

function scale(score: number, maximum: number, weight: number) {
  return Math.round((score / maximum) * weight);
}

function buildReasons(input: LeadScoreInput) {
  const reasons: string[] = [];
  if (input.kakaoMatched && input.kakaoPhone) reasons.push("카카오 연락처 ✓");
  else if (input.kakaoMatched) reasons.push("카카오 장소 일치");
  else if (input.hasPhone) reasons.push("인허가 연락처");
  if (input.leadPeriod === "today") reasons.push("오늘 개업");
  const pyeong = squareMetersToPyeong(input.storeAreaSqm);
  if (pyeong !== undefined) reasons.push(`${pyeong}평`);
  if ((input.reviewCount || 0) > 0 || (input.keywordVolume || 0) > 0) reasons.push("온라인 활성도");
  return reasons;
}
