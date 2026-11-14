import { describe, expect, it } from "vitest";
import { isClosedLead } from "../lib/leads";

describe("closed lead rule (CC-46-4)", () => {
  it("treats a lead status starting with 폐업 as closed", () => {
    expect(isClosedLead({ status: "폐업 확인 필요" })).toBe(true);
    expect(isClosedLead({ status: "폐업(2025-03-01)" })).toBe(true);
  });
  it("treats a permit status with 폐업·말소·취소 as closed", () => {
    expect(isClosedLead({ status: "신규 수집", permitStatus: "폐업" })).toBe(true);
    expect(isClosedLead({ status: "신규 수집", permitStatus: "직권말소" })).toBe(true);
    expect(isClosedLead({ status: "신규 수집", permitStatus: "허가취소" })).toBe(true);
  });
  it("keeps open or unknown leads", () => {
    expect(isClosedLead({ status: "신규 수집", permitStatus: "영업/정상" })).toBe(false);
    expect(isClosedLead({ status: "영업 중" })).toBe(false);
    expect(isClosedLead({})).toBe(false);
    expect(isClosedLead({ status: "제외", permitStatus: "휴업" })).toBe(false);
  });
});
