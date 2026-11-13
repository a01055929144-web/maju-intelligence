import { describe, expect, it } from "vitest";
import { caretAfterFormat, formatMoneyInput, formatWon, parseMoney } from "../domains/shared/money";

describe("parseMoney", () => {
  it("strips commas, won sign and spaces", () => {
    expect(parseMoney("56,760원")).toBe(56760);
    expect(parseMoney(" 56 760 ")).toBe(56760);
    expect(parseMoney("56760")).toBe(56760);
  });
  it("returns null for empty or non numeric text", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("12a")).toBeNull();
  });
  it("accepts negatives only when allowed and drops decimals", () => {
    expect(parseMoney("-500")).toBeNull();
    expect(parseMoney("-500", true)).toBe(-500);
    expect(parseMoney("−500", true)).toBe(-500);
    expect(parseMoney("1,234.9")).toBe(1234);
  });
});

describe("formatMoneyInput and caret", () => {
  it("adds thousands separators while typing", () => {
    expect(formatMoneyInput("57000")).toBe("57,000");
    expect(formatMoneyInput("5,70000")).toBe("570,000");
    expect(formatMoneyInput("")).toBe("");
    expect(formatMoneyInput("007")).toBe("7");
    expect(formatMoneyInput("-1234", true)).toBe("-1,234");
    expect(formatMoneyInput("-1234")).toBe("1,234");
  });
  it("keeps the caret after the same digit", () => {
    expect(caretAfterFormat("57,000", 2)).toBe(2); // 5,7|,000 → 57|
    expect(caretAfterFormat("570,000", 4)).toBe(5); // 570,0|00 → after the 4th digit
    expect(caretAfterFormat("570,000", 0)).toBe(0);
    expect(caretAfterFormat("570,000", 99)).toBe(7);
  });
  it("formats a won label", () => {
    expect(formatWon(56760)).toBe("56,760원");
  });
});
