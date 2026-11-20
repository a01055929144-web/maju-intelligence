import { describe, expect, it } from "vitest";
import { buildPermitLeadContactPhoneChanges, isPermitLeadContactPhoneWriteEnabled } from "../lib/store";

describe("buildPermitLeadContactPhoneChanges", () => {
  it("normalizes only the supplied phone fields", () => {
    expect(buildPermitLeadContactPhoneChanges({ ownerMobilePhone: "010-1234-5678" })).toEqual({
      changes: { ownerMobilePhone: "01012345678" },
      ok: true
    });
    expect(buildPermitLeadContactPhoneChanges({ storePhone: "02 1234 5678" })).toEqual({
      changes: { storePhone: "0212345678" },
      ok: true
    });
  });

  it("keeps null and empty-string clearing scoped to the supplied field", () => {
    expect(buildPermitLeadContactPhoneChanges({ ownerMobilePhone: null })).toEqual({
      changes: { ownerMobilePhone: null },
      ok: true
    });
    expect(buildPermitLeadContactPhoneChanges({ storePhone: "" })).toEqual({
      changes: { storePhone: null },
      ok: true
    });
  });

  it("rejects a store phone in the owner mobile field and vice versa", () => {
    expect(buildPermitLeadContactPhoneChanges({ ownerMobilePhone: "070-1111-2222" }).ok).toBe(false);
    expect(buildPermitLeadContactPhoneChanges({ storePhone: "010-1111-2222" }).ok).toBe(false);
  });

  it("does not infer either new field from the legacy phone", () => {
    expect(buildPermitLeadContactPhoneChanges({}).ok).toBe(false);
  });
});

describe("isPermitLeadContactPhoneWriteEnabled", () => {
  it("requires both the default-off switch and an exact company allowlist match", () => {
    const previousEnabled = process.env.FEATURE_LEAD_CONTACT_PHONES;
    const previousCompanyIds = process.env.FEATURE_LEAD_CONTACT_PHONES_COMPANY_IDS;
    try {
      delete process.env.FEATURE_LEAD_CONTACT_PHONES;
      process.env.FEATURE_LEAD_CONTACT_PHONES_COMPANY_IDS = "company-1";
      expect(isPermitLeadContactPhoneWriteEnabled("company-1")).toBe(false);

      process.env.FEATURE_LEAD_CONTACT_PHONES = "true";
      expect(isPermitLeadContactPhoneWriteEnabled("company-2")).toBe(false);
      expect(isPermitLeadContactPhoneWriteEnabled("company-1")).toBe(true);
    } finally {
      if (previousEnabled === undefined) delete process.env.FEATURE_LEAD_CONTACT_PHONES;
      else process.env.FEATURE_LEAD_CONTACT_PHONES = previousEnabled;
      if (previousCompanyIds === undefined) delete process.env.FEATURE_LEAD_CONTACT_PHONES_COMPANY_IDS;
      else process.env.FEATURE_LEAD_CONTACT_PHONES_COMPANY_IDS = previousCompanyIds;
    }
  });
});
