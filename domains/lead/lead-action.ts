export type LeadActionType = "call" | "dm" | "visit" | "hold" | "exclude" | "quote";

export type LeadAction = {
  id: string;
  actionType: string;
  result?: string;
  memo?: string;
  actorName?: string;
  createdAt: string;
};

export type RecordLeadActionInput = {
  actionType: LeadActionType;
  actorName: string;
  memo?: string;
  result?: string;
};

export interface LeadActionRepository {
  list(companyId: string, leadId: string, limit?: number): Promise<LeadAction[]>;
  record(companyId: string, leadId: string, input: RecordLeadActionInput): Promise<{ action?: LeadAction; ok: boolean; status: string }>;
}

export function resolveLeadContactActorName(candidates: readonly (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const name = candidate?.trim();
    if (name) return name.slice(0, 80);
  }
  return "이름 미등록 직원";
}

export function normalizeLeadActionLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(50, Math.trunc(limit as number)));
}
