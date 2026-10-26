import { describe, expect, it } from "vitest";
import {
  buildLeadSourceDisclosure,
  leadSourceLabel,
  normalizeDoNotContactValue,
  requiresAfterHoursConfirmation
} from "../domains/lead/outreach-governance";

describe("lead outreach governance", () => {
  it("explains known lead sources without overstating collection details", () => {
    expect(leadSourceLabel("kakao_keyword_search")).toBe("카카오 장소 검색");
    expect(buildLeadSourceDisclosure({ businessName: "면볶당", collectedAt: "2026-10-27T01:00:00.000Z", source: "localdata_api" })).toContain(
      "지방행정 인허가 공개데이터에서 2026. 10. 27. 확인했습니다"
    );
    expect(leadSourceLabel("unknown")).toBe("확인 중인 공개·직접 수집 정보");
  });

  it("requires confirmation during the Seoul quiet hours", () => {
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T12:00:00.000Z"))).toBe(true); // 21:00 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T22:59:00.000Z"))).toBe(true); // 07:59 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T23:00:00.000Z"))).toBe(false); // 08:00 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T11:59:00.000Z"))).toBe(false); // 20:59 KST
  });

  it("normalizes contact values for a company do-not-contact registry", () => {
    expect(normalizeDoNotContactValue("sms", "10-3306-4790")).toBe("01033064790");
    expect(normalizeDoNotContactValue("email", "MAILTO:Owner@Example.COM")).toBe("owner@example.com");
    expect(normalizeDoNotContactValue("instagram", "https://instagram.com/My.Shop/")).toBe("my.shop");
    expect(normalizeDoNotContactValue("talktalk", "HTTPS://TALK.NAVER.COM/ct/ABC/")).toBe("https://talk.naver.com/ct/abc");
  });
});
