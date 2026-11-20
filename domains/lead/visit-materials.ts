export const VISIT_MATERIALS = ["단가표", "견적서", "브로슈어", "명함"] as const;
export type VisitMaterial = (typeof VISIT_MATERIALS)[number];

export type VisitMaterialRecord = {
  at: string;
  leadId: string;
  materials: readonly string[];
  memo?: string | null;
  photoStoragePath?: string | null;
};

export type VisitReaction = {
  leadId: string;
  contactedAt?: string | null;
  openedAt?: string | null;
  orderedAt?: string | null;
};

export function normalizeVisitMaterials(values: readonly string[]): VisitMaterial[] {
  return VISIT_MATERIALS.filter((material) => values.includes(material));
}

export function revisitAt(lastVisitAt: string): string {
  return new Date(new Date(lastVisitAt).getTime() + 14 * 86_400_000).toISOString();
}

export function visitRevisitCandidates(
  visits: readonly VisitMaterialRecord[],
  reactions: readonly VisitReaction[],
  now = new Date(),
  extraMinutes: Readonly<Record<string, number | undefined>> = {}
) {
  const latest = new Map<string, VisitMaterialRecord>();
  for (const visit of visits) if (!latest.has(visit.leadId) || visit.at > latest.get(visit.leadId)!.at) latest.set(visit.leadId, visit);
  const reactionByLead = new Map(reactions.map((reaction) => [reaction.leadId, reaction]));
  return Array.from(latest.values())
    .map((visit) => ({ ...visit, revisitAt: revisitAt(visit.at), reaction: reactionByLead.get(visit.leadId), extraMinutes: extraMinutes[visit.leadId] }))
    .filter((visit) => visit.revisitAt <= now.toISOString())
    .sort((a, b) => (a.extraMinutes ?? Number.POSITIVE_INFINITY) - (b.extraMinutes ?? Number.POSITIVE_INFINITY) || a.revisitAt.localeCompare(b.revisitAt));
}

export function isVisitPhotoStoragePath(companyId: string, value?: string | null) {
  return !value || (value.startsWith(`lead-visits/${companyId}/`) && !value.includes("..") && value.length <= 500);
}
