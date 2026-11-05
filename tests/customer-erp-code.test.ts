import { describe, expect, it } from "vitest";
import { customerErpCode } from "../domains/product/customer-erp-code";

describe("customer ERP code display", () => {
  it("hides MAJU-generated identifiers without hiding customer codes", () => {
    expect(customerErpCode("P-000001")).toBe("");
    expect(customerErpCode(null)).toBe("");
    expect(customerErpCode("ERP-42")).toBe("ERP-42");
  });
});
