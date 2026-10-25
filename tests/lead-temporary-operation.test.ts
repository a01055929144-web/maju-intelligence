import { describe, expect, it } from "vitest";
import { classifyTemporaryPermitLead } from "../domains/lead/temporary-operation";

describe("temporary permit lead classification", () => {
  it.each(["뽕스(한시적)", "키노 팝업", "백화점 식품 행사장"])("detects a temporary business name: %s", (businessName) => {
    expect(classifyTemporaryPermitLead({ businessName }).isTemporary).toBe(true);
  });

  it.each(["양재천 일대", "철도공원 일원", "시민 광장"])("detects a temporary location marker: %s", (address) => {
    expect(classifyTemporaryPermitLead({ address }).isTemporary).toBe(true);
  });

  it("detects a permit period ending within 90 days", () => {
    expect(classifyTemporaryPermitLead({ openDate: "2026-10-01", closeDate: "2026-10-31" })).toEqual({
      isTemporary: true,
      reason: "인허가 기간 30일"
    });
  });

  it("keeps a long-running store", () => {
    expect(classifyTemporaryPermitLead({ businessName: "일반 식당", openDate: "2025-01-01", closeDate: "2026-10-31" }).isTemporary).toBe(false);
  });
});
