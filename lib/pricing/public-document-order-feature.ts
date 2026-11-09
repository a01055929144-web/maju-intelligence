import { documentSharingEnabled } from "./document-share-feature";

/** Recipient-free share DDL and 07 signup contract must be approved separately. */
export function publicDocumentOrderEntryEnabled(companyId?: string) {
  return process.env.PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED === "true" && documentSharingEnabled(companyId);
}
