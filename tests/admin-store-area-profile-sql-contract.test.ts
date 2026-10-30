import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareStoredStoreAreaSources, profileStoreAreaSource } from "../domains/lead/store-area-source-profile";

describe("admin store-area SQL draft contract", () => {
  it("matches the measured sample aggregate used by the server RPC draft", () => {
    const profile = profileStoreAreaSource([
      { areaRaw: null, industry: "한식", source: "operational_database" },
      { areaRaw: 0, industry: "한식", source: "operational_database" },
      { areaRaw: 10, industry: "한식", source: "operational_database" },
      { areaRaw: 30, industry: "한식", source: "operational_database" },
      { areaRaw: 100_001, industry: "카페", source: "operational_database" }
    ], { minimumIndustrySample: 1 });
    const comparison = compareStoredStoreAreaSources([
      { leadId: "same", source: "gov_restaurant_api", areaRaw: 30 },
      { leadId: "same", source: "seoul_opendata_api", areaRaw: 30.01 },
      { leadId: "missing", source: "gov_restaurant_api", areaRaw: "" },
      { leadId: "missing", source: "seoul_opendata_api", areaRaw: 20 }
    ]);

    expect({
      profile: {
        totalRows: profile.actual.rows,
        blankCount: profile.actual.blank,
        blankRate: profile.actual.blankRate,
        zeroCount: profile.actual.zero,
        zeroRate: profile.actual.zeroRate,
        invalidCount: profile.actual.invalid,
        invalidRate: profile.actual.invalidRate,
        positiveCount: profile.actual.positive,
        industryMedians: profile.byIndustry
      },
      sourceComparison: comparison
    }).toEqual({
      profile: {
        totalRows: 5,
        blankCount: 1,
        blankRate: 20,
        zeroCount: 1,
        zeroRate: 20,
        invalidCount: 1,
        invalidRate: 20,
        positiveCount: 2,
        industryMedians: [{ industry: "한식", medianSqm: 20, positiveRows: 2, sampledRows: 4 }]
      },
      sourceComparison: {
        comparableAreaCount: 1,
        equalWithinPrecisionCount: 1,
        governmentSourceRecords: 2,
        matchedLeadCount: 2,
        measurement: "measured",
        medianAbsoluteDifferenceSqm: 0.01,
        missingAreaOnEitherSourceCount: 1,
        seoulSourceRecords: 2
      }
    });
  });

  it("keeps company scoping and service-role-only execution in the SQL draft", () => {
    const sql = readFileSync("docs/sql-drafts/admin-store-area-profile-rpc.sql", "utf8");
    expect(sql.match(/company_id = p_company_id/g)).toHaveLength(2);
    expect(sql).toContain("security invoker");
    expect(sql).toContain("replace(btrim(coalesce(source_record.raw_payload ->> 'storeAreaSqm', '')), ',', '')");
    expect(sql).toContain("raw_area_sqm < 0 or raw_area_sqm > 100000");
    expect(sql).toContain("raw_area_sqm = 0");
    expect(sql).toContain("array_agg(rounded_area_sqm order by last_seen_at desc nulls last, id)");
    expect(sql).toContain("round(abs(government_area - seoul_area), 2) <= 0.01");
    expect(sql).toContain("revoke all on function public.admin_store_area_profile(uuid) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.admin_store_area_profile(uuid) to service_role");
  });
});
