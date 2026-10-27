import { describe, expect, it } from "vitest";
import {
  buildInstagramDmUrl,
  buildMailtoUrl,
  buildNaverMapSearchUrl,
  buildSmsUrl,
  extractInstagramHandle,
  fillLeadMessageTemplate,
  formatKoreanPhoneNumber,
  isLeadContactActionType,
  isMobilePhoneNumber,
  leadContactPriorityRank,
  normalizeEmailInput,
  normalizeFaxNumberInput,
  normalizeNaverTalktalkInput,
  resolveLeadContactChannels,
  resolvePrimaryLeadContactChannel
} from "../domains/lead/contact-channels";

describe("lead contact channels", () => {
  it("detects mobile numbers including a dropped leading zero", () => {
    expect(isMobilePhoneNumber("010-1234-5678")).toBe(true);
    expect(isMobilePhoneNumber("1033064790")).toBe(true);
    expect(isMobilePhoneNumber("02-567-5185")).toBe(false);
    expect(isMobilePhoneNumber("070-8888-1234")).toBe(false);
  });

  it("formats phone and fax numbers", () => {
    expect(formatKoreanPhoneNumber("1033064790")).toBe("010-3306-4790");
    expect(formatKoreanPhoneNumber("025675185")).toBe("02-567-5185");
    expect(formatKoreanPhoneNumber("0314005000")).toBe("031-400-5000");
    expect(formatKoreanPhoneNumber("15880000")).toBe("1588-0000");
  });

  it("normalizes fax input", () => {
    expect(normalizeFaxNumberInput("02 555 1234")).toEqual({ ok: true, value: "02-555-1234" });
    expect(normalizeFaxNumberInput("")).toEqual({ ok: true, value: null });
    expect(normalizeFaxNumberInput("1234").ok).toBe(false);
  });

  it("normalizes email input", () => {
    expect(normalizeEmailInput(" Owner@Example.com ")).toEqual({ ok: true, value: "owner@example.com" });
    expect(normalizeEmailInput("mailto:a@b.co")).toEqual({ ok: true, value: "a@b.co" });
    expect(normalizeEmailInput("not-an-email").ok).toBe(false);
    expect(normalizeEmailInput(null)).toEqual({ ok: true, value: null });
  });

  it("normalizes naver talktalk input and rejects place urls", () => {
    expect(normalizeNaverTalktalkInput("https://talk.naver.com/ct/w4abcd")).toEqual({ ok: true, value: "https://talk.naver.com/ct/w4abcd" });
    expect(normalizeNaverTalktalkInput("talk.naver.com/w4abcd?frm=place")).toEqual({ ok: true, value: "https://talk.naver.com/ct/w4abcd" });
    expect(normalizeNaverTalktalkInput("w4abcd")).toEqual({ ok: true, value: "https://talk.naver.com/ct/w4abcd" });
    expect(normalizeNaverTalktalkInput("https://map.naver.com/p/entry/place/1234").ok).toBe(false);
  });

  it("extracts instagram handles", () => {
    expect(extractInstagramHandle("https://www.instagram.com/hwadeok_gopchang/")).toBe("hwadeok_gopchang");
    expect(extractInstagramHandle("@hwadeok.gopchang")).toBe("hwadeok.gopchang");
    expect(extractInstagramHandle("https://instagram.com/p/abc")).toBeUndefined();
    expect(extractInstagramHandle("한글 아이디")).toBeUndefined();
  });

  it("builds deep links", () => {
    expect(buildInstagramDmUrl("hwadeok")).toBe("https://ig.me/m/hwadeok");
    expect(buildSmsUrl("010-1234-5678", "안녕 하세요")).toBe("sms:01012345678?&body=%EC%95%88%EB%85%95%20%ED%95%98%EC%84%B8%EC%9A%94");
    expect(buildMailtoUrl("a@b.co", "제목", "본문")).toBe("mailto:a@b.co?subject=%EC%A0%9C%EB%AA%A9&body=%EB%B3%B8%EB%AC%B8");
    expect(buildNaverMapSearchUrl("면볶당", "서울 송파구 잠실동 123")).toBe(`https://map.naver.com/p/search/${encodeURIComponent("면볶당 서울 송파구 잠실동")}`);
  });

  it("fills message templates and drops empty variables", () => {
    expect(fillLeadMessageTemplate("{상호} 사장님, {회사명} {담당자명}입니다. {단가표 링크}", { businessName: "면볶당", companyName: "마주식자재" })).toBe(
      "면볶당 사장님, 마주식자재입니다."
    );
    expect(fillLeadMessageTemplate("안녕하세요. 담당자 연락처: {담당자 연락처}. 단가표 링크: {단가표 링크}", { businessName: "면볶당" })).toBe("안녕하세요.");
    expect(
      fillLeadMessageTemplate("{상호} 사장님, {회사명} {담당자명}입니다. 담당자 연락처: {담당자 연락처}. 단가표 링크: {단가표 링크}", {
        businessName: "면볶당"
      })
    ).toBe("면볶당 사장님.");
    expect(fillLeadMessageTemplate("안녕하세요. (담당 {담당자명} · {담당자 연락처}) 상담 도와드리겠습니다.", { businessName: "면볶당" })).toBe(
      "안녕하세요.\n상담 도와드리겠습니다."
    );
    expect(fillLeadMessageTemplate("{상호} 대표님, 반갑습니다! 오늘 납품 품목을 안내드립니다. 확인 부탁드립니다.", { businessName: "면볶당" })).toBe(
      "면볶당 대표님, 반갑습니다!\n오늘 납품 품목을 안내드립니다.\n확인 부탁드립니다."
    );
    expect(fillLeadMessageTemplate("{모르는값} 유지", { businessName: "x" })).toBe("{모르는값} 유지");
  });

  it("ranks channels: mobile first, store landline is not a channel", () => {
    expect(resolvePrimaryLeadContactChannel({ phone: "010-1234-5678", fax: "02-555-1234" })).toBe("sms");
    expect(resolvePrimaryLeadContactChannel({ phone: "02-567-5185", instagramUrl: "@shop" })).toBe("instagram");
    expect(resolvePrimaryLeadContactChannel({ phone: "02-567-5185", naverTalktalkUrl: "https://talk.naver.com/ct/w4abcd" })).toBe("talktalk");
    expect(resolvePrimaryLeadContactChannel({ phone: "02-567-5185", email: "a@b.co" })).toBe("email");
    expect(resolvePrimaryLeadContactChannel({ phone: "02-567-5185" })).toBe("visit");
    expect(leadContactPriorityRank({ phone: "070-1111-2222", fax: "02-555-1234" })).toBe(3);
    const channels = resolveLeadContactChannels({ phone: "02-567-5185" }).map((entry) => entry.channel);
    expect(channels).toEqual(["sms", "instagram", "talktalk", "email", "fax", "visit"]);
  });

  it("counts new channel actions as contacts but not hold/exclude", () => {
    for (const type of ["sms", "talktalk", "email", "fax", "dm", "call", "visit", "quote"]) expect(isLeadContactActionType(type)).toBe(true);
    expect(isLeadContactActionType("hold")).toBe(false);
    expect(isLeadContactActionType("exclude")).toBe(false);
  });
});
