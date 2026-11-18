import { afterEach, describe, expect, it, vi } from "vitest";
import { processLeadBulkJob, type LeadBulkRepository } from "@/application/lead/run-bulk-enrichment";
import { normalizeLeadBulkIds, type LeadBulkJobItem } from "@/domains/lead/bulk-enrichment";
import { leadBulkDailyCap, leadBulkEnrichmentEnabled, leadBulkMinIntervalMs } from "@/lib/lead-bulk-enrichment-feature";

const companyId = "10000000-0000-4000-8000-000000000001";
const jobId = "20000000-0000-4000-8000-000000000001";
const items: LeadBulkJobItem[] = Array.from({ length: 50 }, (_, index) => ({
  id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  jobId, companyId, action: "external_info",
  leadId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
}));

afterEach(() => {
  delete process.env.LEAD_BULK_ENRICHMENT_ENABLED;
  delete process.env.FEATURE_LEAD_BULK_ENRICHMENT_COMPANY_IDS;
  delete process.env.LEAD_BULK_ENRICHMENT_DAILY_CAP;
  delete process.env.LEAD_BULK_ENRICHMENT_REQUESTS_PER_SECOND;
});

describe("lead bulk enrichment", () => {
  it("processes a fake batch of 50 strictly one at a time and keeps going after a row failure", async () => {
    const queue = [...items];
    const completed: Array<{ id: string; ok: boolean }> = [];
    let active = 0;
    let peak = 0;
    const repository = {
      claimNext: vi.fn(async () => queue.shift() ?? null),
      completeItem: vi.fn(async (item, outcome) => completed.push({ id: item.id, ok: outcome.ok }))
    } as unknown as LeadBulkRepository;
    const processed = await processLeadBulkJob({ companyId, jobId, dailyCap: 50, minIntervalMs: 1000, repository,
      wait: vi.fn(async () => undefined), execute: async (item) => {
        active += 1; peak = Math.max(peak, active);
        try { if (item === items[16]) throw new Error("fake failure"); return item.leadId; } finally { active -= 1; }
      }
    });
    expect(processed).toBe(50);
    expect(peak).toBe(1);
    expect(completed).toHaveLength(50);
    expect(completed.filter((row) => !row.ok)).toEqual([{ id: items[16].id, ok: false }]);
    expect(completed.map((row) => row.id)).toEqual(items.map((row) => row.id));
  });

  it("is off by default and also requires an exact company allowlist match", () => {
    expect(leadBulkEnrichmentEnabled(companyId)).toBe(false);
    process.env.LEAD_BULK_ENRICHMENT_ENABLED = "true";
    process.env.FEATURE_LEAD_BULK_ENRICHMENT_COMPANY_IDS = "other-company";
    expect(leadBulkEnrichmentEnabled(companyId)).toBe(false);
    process.env.FEATURE_LEAD_BULK_ENRICHMENT_COMPANY_IDS = `other-company, ${companyId}`;
    expect(leadBulkEnrichmentEnabled(companyId)).toBe(true);
  });

  it("caps input, daily allowance and request rate", () => {
    const ids = Array.from({ length: 51 }, (_, index) => `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    expect(normalizeLeadBulkIds([...ids, ids[0]])).toHaveLength(51);
    process.env.LEAD_BULK_ENRICHMENT_DAILY_CAP = "5000";
    process.env.LEAD_BULK_ENRICHMENT_REQUESTS_PER_SECOND = "99";
    expect(leadBulkDailyCap()).toBe(1000);
    expect(leadBulkMinIntervalMs()).toBe(500);
  });
});
