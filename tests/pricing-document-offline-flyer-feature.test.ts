import { afterEach, describe, expect, it } from "vitest";
import { documentOfflineFlyerEnabled } from "../lib/pricing/document-offline-flyer-feature";

const original = { enabled: process.env.PRICING_DOCUMENT_OFFLINE_FLYER_ENABLED, ids: process.env.PRICING_DOCUMENT_OFFLINE_FLYER_COMPANY_IDS };

afterEach(() => {
  if (original.enabled === undefined) delete process.env.PRICING_DOCUMENT_OFFLINE_FLYER_ENABLED;
  else process.env.PRICING_DOCUMENT_OFFLINE_FLYER_ENABLED = original.enabled;
  if (original.ids === undefined) delete process.env.PRICING_DOCUMENT_OFFLINE_FLYER_COMPANY_IDS;
  else process.env.PRICING_DOCUMENT_OFFLINE_FLYER_COMPANY_IDS = original.ids;
});

describe("offline flyer rollout", () => {
  it("is OFF unless both the switch and company allowlist match", () => {
    delete process.env.PRICING_DOCUMENT_OFFLINE_FLYER_ENABLED;
    process.env.PRICING_DOCUMENT_OFFLINE_FLYER_COMPANY_IDS = "company-a";
    expect(documentOfflineFlyerEnabled("company-a")).toBe(false);

    process.env.PRICING_DOCUMENT_OFFLINE_FLYER_ENABLED = "true";
    expect(documentOfflineFlyerEnabled("company-b")).toBe(false);
    expect(documentOfflineFlyerEnabled("company-a")).toBe(true);
  });
});
