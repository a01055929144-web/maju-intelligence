import { afterEach, describe, expect, it } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";
import { audienceLabel, parseAudienceRequest } from "../domains/pricing/promotion-audience";

const id = "c0290000-0000-4000-8000-000000000001";
const store = "20000000-0000-4000-8000-000000000001";

describe("PROMOTION_AUDIENCE switch", () => {
  afterEach(() => { delete process.env.FEATURE_PROMOTION_AUDIENCE_COMPANY_IDS; delete process.env.FEATURE_PROMOTION_AUDIENCE; });
  it("is off by default and on only for listed companies", () => {
    expect(isFeatureEnabled("PROMOTION_AUDIENCE", "c1")).toBe(false);
    process.env.FEATURE_PROMOTION_AUDIENCE_COMPANY_IDS = "c1";
    expect(isFeatureEnabled("PROMOTION_AUDIENCE", "c1")).toBe(true);
    expect(isFeatureEnabled("PROMOTION_AUDIENCE", "c2")).toBe(false);
  });
});

describe("audienceLabel", () => {
  it("names the audience for the table column", () => {
    expect(audienceLabel(undefined)).toBe("전체 매장");
    expect(audienceLabel({ audience: "all", customers: 0, templates: 0 })).toBe("전체 매장");
    expect(audienceLabel({ audience: "only", customers: 3, templates: 1 })).toBe("매장 3 · 등급 1");
    expect(audienceLabel({ audience: "except", customers: 2, templates: 0 })).toBe("제외: 매장 2");
  });
});

describe("parseAudienceRequest", () => {
  const base = { promotionId: id, expected: 1 };
  it("accepts all/only/except and normalises ids", () => {
    expect(parseAudienceRequest({ ...base, audience: "all", targets: [] })?.audience).toBe("all");
    expect(parseAudienceRequest({ ...base, audience: "only", targets: [{ kind: "customer", id: store.toUpperCase() }] })?.targets[0].id).toBe(store);
    expect(parseAudienceRequest({ ...base, audience: "except", targets: [] })?.audience).toBe("except");
  });
  it("rejects what the database would reject, before calling it", () => {
    expect(parseAudienceRequest({ ...base, audience: "only", targets: [] })).toBeNull();
    expect(parseAudienceRequest({ ...base, audience: "all", targets: [{ kind: "customer", id: store }] })).toBeNull();
    expect(parseAudienceRequest({ ...base, audience: "bogus", targets: [] })).toBeNull();
    expect(parseAudienceRequest({ ...base, expected: 0, audience: "all", targets: [] })).toBeNull();
    expect(parseAudienceRequest({ ...base, audience: "only", targets: [{ kind: "x", id: store }] })).toBeNull();
    expect(parseAudienceRequest({ ...base, audience: "only", targets: [{ kind: "customer", id: "nope" }] })).toBeNull();
    expect(parseAudienceRequest({ promotionId: "nope", expected: 1, audience: "all", targets: [] })).toBeNull();
    expect(parseAudienceRequest(null)).toBeNull();
  });
});
