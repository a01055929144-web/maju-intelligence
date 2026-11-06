import { isId, type DocumentKind } from "../../domains/pricing/document";

export type LeadDocumentContext = { id: string; name: string; backHref: string };
export type DocumentEntryQuery = { start?: unknown; leadId?: unknown };
export async function resolveDocumentEntry(
  scope: { companyId: string; manager: boolean; preview: boolean }, query: DocumentEntryQuery,
  findLead: (companyId: string, leadId: string) => Promise<{ id: string; businessName: string } | null>,
): Promise<{ initialStartKind?: DocumentKind; leadContext?: LeadDocumentContext } | null> {
  if (query.start === undefined && query.leadId === undefined) return {};
  if (query.start !== "sheet" && query.start !== "quote") return null;
  if (query.start === "sheet" && !scope.manager) return null;
  if (query.leadId === undefined) return { initialStartKind: query.start };
  if (!isId(query.leadId)) return null;
  const lead = await findLead(scope.companyId, query.leadId.toLowerCase());
  if (!lead) return null;
  return { initialStartKind: query.start, leadContext: { id: lead.id, name: lead.businessName,
    backHref: `/leads/${lead.id}${scope.preview ? `?companyId=${encodeURIComponent(scope.companyId)}` : ""}` } };
}
