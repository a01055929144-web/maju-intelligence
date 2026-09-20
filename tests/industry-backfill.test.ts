import { describe, expect, it } from "vitest";
import {
  hasCustomerKakaoIndustryEvidence,
  hasLeadKakaoIndustryEvidence,
  replaceIndustryTag,
  resolveKakaoIndustryBackfill
} from "../lib/industry-backfill";

describe("Kakao industry backfill safeguards", () => {
  it("maps only non-standard values into a known bucket", () => {
    expect(resolveKakaoIndustryBackfill("맥주,호프")).toBe("주점");
    expect(resolveKakaoIndustryBackfill("한식")).toBeNull();
    expect(resolveKakaoIndustryBackfill("수동 특수업종")).toBeNull();
  });

  it("requires Kakao evidence before selecting rows", () => {
    expect(hasCustomerKakaoIndustryEvidence({ kakao_place_url: "https://place.map.kakao.com/1" })).toBe(true);
    expect(hasCustomerKakaoIndustryEvidence({})).toBe(false);
    expect(hasLeadKakaoIndustryEvidence({ source: "kakao_keyword_search" })).toBe(true);
    expect(hasLeadKakaoIndustryEvidence({ source: "manual_upload" })).toBe(false);
  });

  it("replaces the raw tag without discarding unrelated tags", () => {
    expect(replaceIndustryTag(["맥주,호프", "야간"], "맥주,호프", "주점")).toEqual(["야간", "주점"]);
  });
});
