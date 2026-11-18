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
  wait?: (ms: number) => Promise<void>;
}) {
  const wait = input.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let processed = 0;
  while (true) {
    const item = await input.repository.claimNext(input.companyId, input.jobId, input.dailyCap);
    if (!item) return processed;
    try {
      await input.repository.completeItem(item, { ok: true, result: await input.execute(item) });
    } catch (error) {
      await input.repository.completeItem(item, { ok: false, error: error instanceof Error ? error.message : "처리 실패" });
    }
    processed += 1;
    await wait(input.minIntervalMs);
  }
}

