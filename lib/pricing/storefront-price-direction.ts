import { supabaseRequest } from "@/lib/store";
import type { DocumentContent } from "../../domains/pricing/document";
import { publishedPriceDirections, type SalesPriceDirection } from "../../domains/pricing/storefront-price-direction";

export function priceDirectionEnabled() {
  return process.env.STOREFRONT_PRICE_DIRECTION_ENABLED === "true";
}
export async function readPublishedPriceDirections(companyId: string, optedIn: boolean, current: {
  document_id?: string; version: number; content: DocumentContent;
}) {
  const empty = new Map<string, SalesPriceDirection>();
  if (!priceDirectionEnabled() || !optedIn || !current.document_id || !Number.isSafeInteger(current.version) || current.version <= 1) return empty;
  const previousVersion = current.version - 1;
  // Direction is optional: history availability must never block the current order link.
  const rows = await supabaseRequest<Array<{ version: number; content: DocumentContent }>>(
    `pricing_document_versions?company_id=eq.${encodeURIComponent(companyId)}&document_id=eq.${encodeURIComponent(current.document_id)}&version=eq.${previousVersion}&select=version,content&limit=1`,
  ).catch(() => []);
  if (rows[0]?.version !== previousVersion) return empty;
  return publishedPriceDirections(current.content, rows[0].content);
}
