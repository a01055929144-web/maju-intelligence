import {
  compareStoredStoreAreaSources,
  profileStoreAreaSource,
  type StoreAreaSourceRecord
} from "../domains/lead/store-area-source-profile";
import { supabaseRequest } from "./store";
import { readCappedPages } from "./paginated-profile-read";

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_DATASET = 30_000;

export async function readAllProfileRows<T>(table: string, select: string) {
  // Supabase/PostgREST max_rows가 PAGE_SIZE보다 작아도 실제 수신 건수만큼 다음 offset으로
  // 이동한다. page.length < PAGE_SIZE만으로 종료하면 조용히 불완전한 집계를 만들 수 있다.
  return readCappedPages<T>(
    (offset) => supabaseRequest<T[]>(
      `${table}?select=${select}&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    ),
    MAX_ROWS_PER_DATASET
  );
}

type LeadAreaRow = { industry_raw: string | null; store_area_sqm: number | null };
type SourceRow = { area_raw: unknown; lead_id: string; source: string };

export async function getAdminStoreAreaProfile() {
  const [leads, sourceRows] = await Promise.all([
    readAllProfileRows<LeadAreaRow>("business_permit_leads", "id,industry_raw,store_area_sqm"),
    readAllProfileRows<SourceRow>(
      "business_permit_lead_source_records",
      // ingestPermitLeadRows가 PermitLeadIngestRow를 raw_payload에 그대로 저장하므로 실제 키는
      // camelCase storeAreaSqm이다. 전체 JSON 대신 이 한 필드만 PostgREST에서 투영한다.
      "id,lead_id,source,area_raw:raw_payload->storeAreaSqm&source=in.(gov_restaurant_api,seoul_opendata_api)"
    )
  ]);
  const profile = profileStoreAreaSource(leads.map((row) => ({
    areaRaw: row.store_area_sqm,
    industry: row.industry_raw || "미분류",
    source: "operational_database"
  })), { minimumIndustrySample: 1 });
  const comparisonRows: StoreAreaSourceRecord[] = sourceRows.map((row) => ({
    areaRaw: row.area_raw,
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
