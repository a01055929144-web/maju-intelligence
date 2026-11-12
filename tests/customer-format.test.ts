import { describe, expect, it } from "vitest";
import { formatBusinessNumberInput, formatPhoneNumberInput, isValidBusinessRegistrationNumber, noteTypeLabel } from "../components/customers/customer-format";

describe("customer-format (moved from crm/timeline)", () => {
  it("formats while typing", () => {
    expect(formatBusinessNumberInput("1234567890")).toBe("123-45-67890");
    expect(formatPhoneNumberInput("01012345678")).toBe("010-1234-5678");
    expect(formatPhoneNumberInput("021234567")).toBe("02-123-4567");
  });
  it("validates business number checksum and labels notes", () => {
    expect(isValidBusinessRegistrationNumber("1248100998")).toBe(true);
    expect(isValidBusinessRegistrationNumber("1234567890")).toBe(false);
    expect(noteTypeLabel("sales")).toBe("상담");
  });
});
