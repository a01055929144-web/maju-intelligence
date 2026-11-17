import { afterEach, describe, expect, it } from "vitest";
import { setLeadFavorite } from "../application/lead/set-lead-favorite";
import { leadFavoritesEnabled } from "../lib/lead-favorites";

afterEach(() => {
  delete process.env.FEATURE_LEAD_FAVORITES;
  delete process.env.FEATURE_LEAD_FAVORITES_COMPANY_IDS;
});

describe("lead favorite contract", () => {
  it("is enabled only when both the global switch and company allowlist match", () => {
    process.env.FEATURE_LEAD_FAVORITES_COMPANY_IDS = "company-a, company-b";
    expect(leadFavoritesEnabled("company-a")).toBe(false);
    process.env.FEATURE_LEAD_FAVORITES = "true";
    expect(leadFavoritesEnabled("company-a")).toBe(true);
    expect(leadFavoritesEnabled("company-c")).toBe(false);
  });

  it("normalizes the actor and rejects missing audit identity", async () => {
    const repository = { set: async (input: { actorName: string }) => input } as never;
    await expect(setLeadFavorite(repository, {
      actorName: "  담당자  ", actorUserId: null, companyId: "company", leadId: "lead", starred: true
    })).resolves.toMatchObject({ actorName: "담당자" });
    expect(() => setLeadFavorite(repository, {
      actorName: " ", actorUserId: null, companyId: "company", leadId: "lead", starred: true
    })).toThrow("사용자의 이름");
  });
});
