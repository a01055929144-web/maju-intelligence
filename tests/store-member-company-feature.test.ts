import { afterEach, describe, expect, it, vi } from "vitest";

import { isStoreMemberCompanyAllowlisted } from "../lib/store/07-store-member-feature";

afterEach(() => vi.unstubAllEnvs());

describe("store member company rollout", () => {
  it("is default-off and matches only an exact company id", () => {
    expect(isStoreMemberCompanyAllowlisted("company-a")).toBe(false);
    vi.stubEnv("FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS", " company-a,company-b ");
    expect(isStoreMemberCompanyAllowlisted("company-a")).toBe(true);
    expect(isStoreMemberCompanyAllowlisted("company")).toBe(false);
    expect(isStoreMemberCompanyAllowlisted("")).toBe(false);
  });
});
