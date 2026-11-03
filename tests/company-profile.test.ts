import { describe, expect, it } from "vitest";
import { companyProfileProgress, redactCompanyProfile, sanitizeCompanyProfilePatch, visibleCompanyProfileSections } from "../domains/organization/company-profile";

describe("company profile (11/3)", () => {
  it("ignores locked and admin-only fields for operator accounts", () => {
    const { patch } = sanitizeCompanyProfilePatch({ owner_name: "x", settlement_account_number: "1", admin_memo: "m", main_phone: "02-1" }, false);
    expect(patch).toEqual({ main_phone: "02-1" });
  });
  it("lets admins edit locked and admin fields", () => {
    const { patch } = sanitizeCompanyProfilePatch({ owner_name: "대표", grade: "A" }, true);
    expect(patch).toEqual({ owner_name: "대표", grade: "A" });
  });
  it("keeps only known options, contacts and weekdays", () => {
    const { patch } = sanitizeCompanyProfilePatch({
      delivery_methods: ["직배송", "드론"],
      contacts: [{ name: "김", phone: "010", hours: "9~6" }, { name: "", phone: "" }],
      delivery_weekdays: [1, 1, 9, 6],
      payment_cycle: "월말"
    }, false);
    expect(patch.delivery_methods).toEqual(["직배송"]);
    expect(patch.contacts).toEqual([{ name: "김", phone: "010", hours: "9~6" }]);
    expect(patch.delivery_weekdays).toEqual([1, 6]);
    expect(patch.payment_cycle).toBe("월말");
  });
  it("rejects payment cycles outside the list", () => {
    expect(sanitizeCompanyProfilePatch({ payment_cycle: "3일" }, false).error).toBeTruthy();
  });
  it("hides admin section and admin values from operators", () => {
    expect(visibleCompanyProfileSections(false).some((section) => section.id === "admin")).toBe(false);
    expect(redactCompanyProfile({ admin_memo: "x", main_phone: "1" }, false)).toEqual({ main_phone: "1" });
  });
  it("counts 12 accuracy fields", () => {
    expect(companyProfileProgress({ main_phone: "1", contacts: [], payment_cycle: "협의" })).toEqual({ filled: 2, total: 12 });
  });
});

describe("owner can edit locked business fields (11/3 feedback)", () => {
  it("accepts locked fields when canEditLocked but still hides admin-only", () => {
    const { patch } = sanitizeCompanyProfilePatch({ owner_name: "대표", settlement_bank: "KB", grade: "A" }, false, true);
    expect(patch).toEqual({ owner_name: "대표", settlement_bank: "KB" });
  });
});
