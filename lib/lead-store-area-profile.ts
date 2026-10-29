import {
  compareStoredStoreAreaSources,
  profileStoreAreaSource,
  type StoreAreaSourceRecord
} from "@/domains/lead/store-area-source-profile";
import { supabaseRequest } from "@/lib/store";

const PAGE_SIZE = 1000;

async function readAll<T>(table: string, select: string) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await supabaseRequest<T[]>(
      `${table}?select=${select}&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

type LeadAreaRow = { industry_raw: string | null; store_area_sqm: number | null };
type SourceRow = { lead_id: string; raw_payload: Record<string, unknown> | null; source: string };

export async function getAdminStoreAreaProfile() {
  const [leads, sourceRows] = await Promise.all([
    readAll<LeadAreaRow>("business_permit_leads", "id,industry_raw,store_area_sqm"),
    readAll<SourceRow>(
      "business_permit_lead_source_records",
      "id,lead_id,source,raw_payload&source=in.(gov_restaurant_api,seoul_opendata_api)"
    )
  ]);
  const profile = profileStoreAreaSource(leads.map((row) => ({
    areaRaw: row.store_area_sqm,
    industry: row.industry_raw || "미분류",
    source: "operational_database"
  })), { minimumIndustrySample: 1 });
  const comparisonRows: StoreAreaSourceRecord[] = sourceRows.map((row) => ({
    areaRaw: row.raw_payload?.storeAreaSqm,
    leadId: row.lead_id,
    source: row.source
  }));

  return {
    measuredAt: new Date().toISOString(),
    profile: {
      blankCount: profile.actual.blank,
      blankRate: profile.actual.blankRate,
      industryMedians: profile.byIndustry,
      invalidCount: profile.actual.invalid,
      invalidRate: profile.actual.invalidRate,
      positiveCount: profile.actual.positive,
      totalRows: profile.actual.rows,
      zeroCount: profile.actual.zero,
      zeroRate: profile.actual.zeroRate
    },
    sourceComparison: compareStoredStoreAreaSources(comparisonRows)
  };
}
