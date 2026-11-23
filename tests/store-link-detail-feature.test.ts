import { afterEach, describe, expect, it } from "vitest";
import { storeLinkDetailEnabled } from "../lib/pricing/store-link-detail-feature";

const before = { enabled: process.env.STORE_LINK_DETAIL_ENABLED, ids: process.env.STORE_LINK_DETAIL_COMPANY_IDS };
afterEach(() => {
  if (before.enabled === undefined) delete process.env.STORE_LINK_DETAIL_ENABLED; else process.env.STORE_LINK_DETAIL_ENABLED = before.enabled;
  if (before.ids === undefined) delete process.env.STORE_LINK_DETAIL_COMPANY_IDS; else process.env.STORE_LINK_DETAIL_COMPANY_IDS = before.ids;
});

describe("store link detail rollout", () => {
  it("requires both the global switch and company allowlist", () => {
    process.env.STORE_LINK_DETAIL_COMPANY_IDS = "company-a";
    delete process.env.STORE_LINK_DETAIL_ENABLED;
    expect(storeLinkDetailEnabled("company-a")).toBe(false);
    process.env.STORE_LINK_DETAIL_ENABLED = "true";
    expect(storeLinkDetailEnabled("company-b")).toBe(false);
    expect(storeLinkDetailEnabled("company-a")).toBe(true);
  });
});
