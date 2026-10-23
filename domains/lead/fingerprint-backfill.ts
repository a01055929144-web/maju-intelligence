import { buildLeadCanonicalFingerprint } from "./canonical-identity";

export type FingerprintBackfillLead = {
  id: string;
  businessName: string;
  businessNumber?: string | null;
  address?: string | null;
};

export function planLeadFingerprintBackfill(rows: FingerprintBackfillLead[]) {
  const fillable: Array<{ id: string; fingerprint: string }> = [];
  const unfillableIds: string[] = [];
  for (const row of rows) {
    const fingerprint = buildLeadCanonicalFingerprint({
      businessName: row.businessName,
      businessNumber: row.businessNumber || undefined,
      address: row.address || undefined
    });
    if (fingerprint) fillable.push({ id: row.id, fingerprint });
    else unfillableIds.push(row.id);
  }
  return { fillable, unfillableIds };
}
