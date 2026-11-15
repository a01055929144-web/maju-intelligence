import { describe, expect, it } from "vitest";
import { formatNumber, formatWon } from "../domains/shared/money";
import { formatPhoneNumber, formatPhoneNumberInput, phoneDigits } from "../lib/phone";
import { formatPhoneNumberInput as customerFormatInput } from "../components/customers/customer-format";

describe("금액 표시 (47-7)", () => {
  it("formatNumber·formatWon: 천 단위 쉼표, 원", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatWon(56760)).toBe("56,760원");
    expect(formatWon(0)).toBe("0원");
  });
});

describe("전화 정리 (47-7) — 화면마다 따로 있던 규칙을 lib/phone 하나로", () => {
  it("phoneDigits: 숫자만, 기본 11자리까지", () => {
    expect(phoneDigits("010-1234-5678")).toBe("01012345678");
    expect(phoneDigits("010-1234-56789")).toBe("01012345678");
    expect(phoneDigits("1234567890", 10)).toBe("1234567890");
    expect(phoneDigits("가짜")).toBe("");
  });
  it("입력 중 포맷: 02·010·긴 번호, 숫자가 없으면 빈 글", () => {
    expect(formatPhoneNumberInput("01012345678")).toBe("010-1234-5678");
    expect(formatPhoneNumberInput("021234567")).toBe("02-123-4567");
    expect(formatPhoneNumberInput("0212345678")).toBe("02-1234-5678");
    expect(formatPhoneNumberInput("0311234567")).toBe("031-123-4567");
    expect(formatPhoneNumberInput("가짜")).toBe("");
  });
  it("저장값 표시(formatPhoneNumber)와 입력 포맷이 같은 자릿수 규칙, 숫자 없는 글은 원문 유지", () => {
    for (const raw of ["01012345678", "021234567", "0212345678", "0311234567", "010", "0101"]) expect(formatPhoneNumber(raw)).toBe(formatPhoneNumberInput(raw));
    expect(formatPhoneNumber("문의 요망")).toBe("문의 요망");
    expect(formatPhoneNumber(null)).toBe("");
  });
  it("옛 경로(customer-format)는 같은 함수를 다시 내보낸다", () => {
    expect(customerFormatInput).toBe(formatPhoneNumberInput);
  });
});
