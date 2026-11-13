import { describe, expect, it } from "vitest";
import { matchesExcludedCode, type ExcludedCode } from "../domains/pricing/purchase-excluded-codes";

const saved: ExcludedCode[] = [{ id: "1", code: "AB-1", supplierName: null }, { id: "2", code: "ZZ", supplierName: "가나다" }];

describe("matchesExcludedCode", () => {
  it("matches company-wide codes for any supplier, ignoring case", () => {
    expect(matchesExcludedCode({ code: "ab-1 ", supplier: "다른" }, saved)).toBe(true);
  });
  it("matches a supplier-scoped code only for that supplier", () => {
    expect(matchesExcludedCode({ code: "ZZ", supplier: "가나다" }, saved)).toBe(true);
    expect(matchesExcludedCode({ code: "ZZ", supplier: "라마바" }, saved)).toBe(false);
  });
  it("never excludes a line without a code", () => {
    expect(matchesExcludedCode({ code: " ", supplier: "" }, [{ id: "3", code: "", supplierName: null }])).toBe(false);
  });
});
