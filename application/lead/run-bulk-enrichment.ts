import type { LeadBulkAction, LeadBulkJob, LeadBulkJobItem } from "@/domains/lead/bulk-enrichment";

export type LeadBulkRepository = {
  claimNext(companyId: string, jobId: string, dailyCap: number): Promise<LeadBulkJobItem | null>;
  completeItem(item: LeadBulkJobItem, outcome: { ok: true; result: unknown } | { ok: false; error: string }): Promise<void>;
  createJob(input: { action: LeadBulkAction; actorName: string; companyId: string; idempotencyKey: string; leadIds: string[] }): Promise<LeadBulkJob>;
  getJob(companyId: string, jobId: string): Promise<LeadBulkJob | null>;
  requestCancel(companyId: string, jobId: string): Promise<LeadBulkJob>;
  retryFailed(companyId: string, jobId: string): Promise<LeadBulkJob>;
};

export type LeadBulkExecutor = (item: LeadBulkJobItem) => Promise<unknown>;

export async function processLeadBulkJob(input: {
  companyId: string;
  dailyCap: number;
  jobId: string;
  minIntervalMs: number;
  repository: LeadBulkRepository;
  execute: LeadBulkExecutor;
  maxRunMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}) {
  const wait = input.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? Date.now;
  const maxRunMs = input.maxRunMs ?? 45_000;
  const startedAt = now();
  let processed = 0;
  while (now() - startedAt < maxRunMs) {
    const item = await input.repository.claimNext(input.companyId, input.jobId, input.dailyCap);
    if (!item) return processed;
    try {
      await input.repository.completeItem(item, { ok: true, result: await input.execute(item) });
    } catch (error) {
      await input.repository.completeItem(item, { ok: false, error: error instanceof Error ? error.message : "처리 실패" });
    }
    processed += 1;
    const remainingMs = maxRunMs - (now() - startedAt);
    if (remainingMs <= 0) return processed;
    await wait(Math.min(input.minIntervalMs, remainingMs));
  }
  return processed;
}

