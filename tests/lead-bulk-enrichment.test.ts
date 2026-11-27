import { afterEach, describe, expect, it, vi } from "vitest";
import { processLeadBulkJob, type LeadBulkRepository } from "@/application/lead/run-bulk-enrichment";
import { isLeadBulkUuid, LEAD_BULK_MAX_ITEMS, normalizeLeadBulkIds, runLeadBulkBatches, type LeadBulkJobItem } from "@/domains/lead/bulk-enrichment";
import { leadBulkDailyCap, leadBulkEnrichmentEnabled, leadBulkMinIntervalMs, leadBulkRunBudgetMs } from "@/lib/lead-bulk-enrichment-feature";

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
  delete process.env.LEAD_BULK_ENRICHMENT_RUN_BUDGET_MS;
});

describe("lead bulk enrichment", () => {
  it.each([51, 120])("continues every synthetic batch for %i selected leads", async (count) => {
    const ids = Array.from({ length: count }, (_, index) => String(index));
    const batches: string[][] = [];
    expect(await runLeadBulkBatches(ids, async (batchIds) => { batches.push(batchIds); return true; })).toBe(true);
    expect(batches.map((batch) => batch.length)).toEqual(count === 51 ? [50, 1] : [50, 50, 20]);
    expect(batches.flat()).toEqual(ids);
  });

  it("does not start the next batch after a stopped or failed batch", async () => {
    const runs: number[] = [];
    expect(await runLeadBulkBatches(Array.from({ length: 120 }, (_, index) => String(index)), async (batchIds) => {
      runs.push(batchIds.length);
      return false;
    })).toBe(false);
    expect(runs).toEqual([50]);
  });

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

  it("stops at the invocation budget and resumes the remaining queue", async () => {
    const queue = items.slice(0, 3);
    let clock = 0;
    const completed: string[] = [];
    const repository = {
      claimNext: vi.fn(async () => queue.shift() ?? null),
      completeItem: vi.fn(async (item) => completed.push(item.id))
    } as unknown as LeadBulkRepository;
    const run = () => processLeadBulkJob({ companyId, jobId, dailyCap: 50, minIntervalMs: 1,
      maxRunMs: 2, now: () => clock, repository, wait: vi.fn(async (ms: number) => { clock += ms; }),
      execute: async (item) => { clock += 1; return item.leadId; }
    });
    expect(await run()).toBe(1);
    expect(queue).toHaveLength(2);
    expect(await run()).toBe(1);
    expect(await run()).toBe(1);
    expect(completed).toHaveLength(3);
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
    const ids = Array.from({ length: LEAD_BULK_MAX_ITEMS + 1 }, (_, index) => `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    expect(normalizeLeadBulkIds([...ids, ids[0]])).toHaveLength(LEAD_BULK_MAX_ITEMS + 1);
    expect(isLeadBulkUuid("zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz")).toBe(false);
    process.env.LEAD_BULK_ENRICHMENT_DAILY_CAP = "5000";
    process.env.LEAD_BULK_ENRICHMENT_REQUESTS_PER_SECOND = "99";
    expect(leadBulkDailyCap()).toBe(1000);
    expect(leadBulkMinIntervalMs()).toBe(500);
    process.env.LEAD_BULK_ENRICHMENT_RUN_BUDGET_MS = "999999";
    expect(leadBulkRunBudgetMs()).toBe(45_000);
  });
});
