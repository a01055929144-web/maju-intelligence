import { describe, expect, it, vi } from "vitest";
import { readLatestBriefing } from "../lib/analytics/briefing-read";

const report = {
  customers: 7,
  health: { total: 91 },
  highProbabilityCount: 4,
  leadRecommendations: Array.from({ length: 15 }),
  missingRegions: ["강원"],
  newOpportunities: 5,
  routeLeads: 3
};

describe("readLatestBriefing", () => {
  it("keeps the existing briefing projection and recommendation cap", async () => {
    const result = await readLatestBriefing(
      "company-a",
      vi.fn().mockResolvedValue(report),
      vi.fn().mockResolvedValue({ customers: [{ id: "1" }, { id: "2" }], source: "supabase" })
    );

    expect(result).toEqual({
      greeting: "안녕하세요 정두영님.",
      currentCustomers: 2,
      weeklyOpportunities: 5,
      todayRecommendations: 12,
      highProbability: 4,
      routeLeads: 3,
      missingRegions: ["강원"],
      healthScore: 91,
      source: "supabase"
    });
  });

  it("keeps the report fallback when customer loading fails", async () => {
    const result = await readLatestBriefing(
      "company-a",
      vi.fn().mockResolvedValue(report),
      vi.fn().mockRejectedValue(new Error("unavailable"))
    );

    expect(result.currentCustomers).toBe(7);
    expect(result.source).toBe("empty");
  });
});
