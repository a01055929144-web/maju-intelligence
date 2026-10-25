import { describe, expect, it } from "vitest";
import { classifyTemporaryPermitLead, resolveTemporaryLeadIngestStatus } from "../domains/lead/temporary-operation";

describe("temporary permit lead classification", () => {
  it.each(["뽕스(한시적)", "키노 팝업", "백화점 식품 행사장"])("detects a temporary business name: %s", (businessName) => {
    expect(classifyTemporaryPermitLead({ businessName }).isTemporary).toBe(true);
  });

  it.each(["양재천 일대", "철도공원 일원", "시민 광장"])("detects a temporary location marker: %s", (address) => {
    expect(classifyTemporaryPermitLead({ address }).isTemporary).toBe(true);
  });

  it("detects a permit period ending within 90 days", () => {
    expect(classifyTemporaryPermitLead({ openDate: "2026-10-01", closeDate: "2026-10-31" })).toEqual({
      isSuspected: false,
      isTemporary: true,
      reason: "인허가 기간 30일"
    });
  });

  it("keeps a long-running store", () => {
    expect(classifyTemporaryPermitLead({ businessName: "일반 식당", openDate: "2025-01-01", closeDate: "2026-10-31" }).isTemporary).toBe(false);
  });

  it.each([
    { address: "서울 강남구 일원동 123", businessName: "○○식당" },
    { address: "서울 강남구 일원로 45" },
    { address: "서울 광진구 광장동 12" },
    { address: "서울 종로구 광장시장 1", businessName: "빈대떡" },
    { businessName: "일대일 PT 카페" },
    { businessName: "광장갈비" }
  ])("does not classify neighborhood, road, market, or business-name fragments as temporary: %j", (input) => {
    expect(classifyTemporaryPermitLead(input)).toMatchObject({ isSuspected: false, isTemporary: false });
  });

  it("keeps an ambiguous standalone plaza address visible for review", () => {
    expect(classifyTemporaryPermitLead({ address: "서울 중구 중앙 광장" })).toEqual({
      isSuspected: true,
      isTemporary: false,
      reason: "임시 영업 의심: 광장"
    });
  });
});

describe("temporary permit lead ingest status priority", () => {
  it("keeps confirmed temporary operation above exclusion", () => {
    expect(resolveTemporaryLeadIngestStatus({ excluded: true, isOwnershipChange: false, isSuspected: false, isTemporary: true })).toBe("임시 영업");
  });

  it("keeps exclusion above suspected temporary operation", () => {
    expect(resolveTemporaryLeadIngestStatus({ excluded: true, isOwnershipChange: false, isSuspected: true, isTemporary: false })).toBe("제외");
  });

  it("uses suspected and ownership-change states only after exclusion", () => {
    expect(resolveTemporaryLeadIngestStatus({ excluded: false, isOwnershipChange: true, isSuspected: true, isTemporary: false })).toBe("임시 영업 의심");
    expect(resolveTemporaryLeadIngestStatus({ excluded: false, isOwnershipChange: true, isSuspected: false, isTemporary: false })).toBe("주인 변경");
  });
});
