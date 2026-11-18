import { afterEach, describe, expect, it } from "vitest";
import { isAdminStoreManagementCompanyAllowed, parseAdminStoreStatusInput } from "../domains/store/admin-store-status";

afterEach(() => { delete process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS; });

describe("admin store status boundary", () => {
  const valid = {
    companyId: "00000000-0000-4000-8000-000000000001",
    storeProfileId: "00000000-0000-4000-8000-000000000002",
    status: "suspended",
    requestKey: "request-000000000001",
  };

  it("accepts only active or suspended with scoped UUIDs and a reusable request key", () => {
    expect(parseAdminStoreStatusInput(valid)).toEqual(valid);
    expect(parseAdminStoreStatusInput({ ...valid, status: "closed" })).toBeNull();
    expect(parseAdminStoreStatusInput({ ...valid, companyId: "other-company" })).toBeNull();
    expect(parseAdminStoreStatusInput({ ...valid, requestKey: "short" })).toBeNull();
  });

  it("is off by default and allows only explicitly listed companies", () => {
    expect(isAdminStoreManagementCompanyAllowed(valid.companyId)).toBe(false);
    process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS = `other, ${valid.companyId}`;
    expect(isAdminStoreManagementCompanyAllowed(valid.companyId)).toBe(true);
    expect(isAdminStoreManagementCompanyAllowed("00000000-0000-4000-8000-000000000009")).toBe(false);
  });
});
