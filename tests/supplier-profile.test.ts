import { describe, expect, it } from "vitest";
import { normalizeProductSupplierProfile } from "../domains/purchasing/supplier-profile";

describe("normalizeProductSupplierProfile", () => {
  it("normalizes a formatted business number and empty values", () => {
    expect(normalizeProductSupplierProfile({
      businessNumber: "123-45-67890",
      contactName: "  홍길동  ",
      memo: "   "
    })).toEqual(expect.objectContaining({
      business_number: "1234567890",
      contact_name: "홍길동",
      memo: null
    }));
  });

  it("rejects a business number that is not ten digits", () => {
    expect(() => normalizeProductSupplierProfile({ businessNumber: "123-45-678" }))
      .toThrow("숫자 10자리");
  });

  it("enforces database-compatible field lengths", () => {
    expect(() => normalizeProductSupplierProfile({ contactPhone: "1".repeat(31) }))
      .toThrow("30자 이하");
  });
});
