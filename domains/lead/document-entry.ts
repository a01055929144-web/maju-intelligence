import { canManagePriceSheets } from "../pricing/access";

export type LeadDocumentEntryAccess = {
  canCreateQuote: boolean;
  canCreateSheet: boolean;
};

export function leadDocumentEntryAccess(input: {
  admin: boolean;
  pricingEnabled: boolean;
  workspaceRole?: string;
}): LeadDocumentEntryAccess {
  const manager = input.admin || canManagePriceSheets({ workspaceRole: input.workspaceRole });
  return {
    canCreateQuote: input.pricingEnabled && (manager || input.workspaceRole === "sales"),
    canCreateSheet: input.pricingEnabled && manager,
  };
}

export function leadDocumentEntryHref(kind: "sheet" | "quote", leadId: string, companyId?: string | null) {
  const params = new URLSearchParams({ start: kind, leadId });
  if (companyId) params.set("companyId", companyId);
  return `/revenue/pricing/documents?${params.toString()}`;
}
