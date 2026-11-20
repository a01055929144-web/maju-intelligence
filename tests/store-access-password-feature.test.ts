import { afterEach, describe, expect, it } from "vitest";
import { isStoreAccessPasswordReadEnabled } from "@/lib/store/07-store-access-password-feature";

const companyId = "10000000-0000-4000-8000-000000000001";

afterEach(() => {
  delete process.env.STORE_ACCESS_PASSWORD_READ_ENABLED;
  delete process.env.FEATURE_STORE_ACCESS_PASSWORD_READ_COMPANY_IDS;
});

describe("store access password feature", () => {
  it("requires both the global switch and the company allowlist", () => {
    expect(isStoreAccessPasswordReadEnabled(companyId)).toBe(false);
    process.env.STORE_ACCESS_PASSWORD_READ_ENABLED = "true";
    expect(isStoreAccessPasswordReadEnabled(companyId)).toBe(false);
    process.env.FEATURE_STORE_ACCESS_PASSWORD_READ_COMPANY_IDS = companyId;
    expect(isStoreAccessPasswordReadEnabled(companyId)).toBe(true);
  });
});
