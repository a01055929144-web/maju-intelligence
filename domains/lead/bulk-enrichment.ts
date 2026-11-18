export const LEAD_BULK_ACTIONS = ["external_info", "place_links", "instagram_candidates"] as const;
export type LeadBulkAction = (typeof LEAD_BULK_ACTIONS)[number];
export type LeadBulkJobStatus = "queued" | "running" | "completed" | "cancelled" | "failed";

export type LeadBulkJob = {
  id: string;
  companyId: string;
  action: LeadBulkAction;
  status: LeadBulkJobStatus;
  totalItems: number;
  succeededItems: number;
  failedItems: number;
  cancelRequestedAt: string | null;
};

export type LeadBulkJobItem = {
  id: string;
  jobId: string;
  companyId: string;
  leadId: string;
  action: LeadBulkAction;
};

export function parseLeadBulkAction(value: unknown): LeadBulkAction | null {
  return LEAD_BULK_ACTIONS.includes(value as LeadBulkAction) ? value as LeadBulkAction : null;
}

export function normalizeLeadBulkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 51);
}

