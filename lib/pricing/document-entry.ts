import { getPermitLeadIdentityForCompany } from "../store";
import { ciLayoutCompany, ciLayoutLeads, isCiLayoutFixturesEnabled } from "../ci-layout-fixtures";

/** Reuse the existing company-scoped identity read; CI uses only its existing synthetic tenant. */
export async function findDocumentEntryLead(companyId: string, leadId: string) {
  if (isCiLayoutFixturesEnabled()) {
    if (companyId !== ciLayoutCompany.id) return null;
    const lead = ciLayoutLeads.find(item => item.id === leadId);
    return lead ? { id: lead.id, businessName: lead.businessName } : null;
  }
  return getPermitLeadIdentityForCompany(companyId, leadId);
}
