import { supabaseRequest } from "../store";
import type { DocumentScope, PricingDocumentsRepository } from "../../application/pricing/documents";
import { withDocumentRecalculations } from "./document-recalculation";
import { catalogDisplaySpec } from "../../domains/pricing/document";

type CatalogResult = { items: Array<{ id: string; spec: string }> };

async function withCatalogSpecs(companyId: string, result: CatalogResult): Promise<CatalogResult> {
  const missing = result.items.filter((item) => !(item.spec || "").trim() && /^[0-9a-f-]{36}$/i.test(item.id));
  if (!missing.length) return result;
  const ids = missing.map((item) => item.id).join(",");
  const rows = await supabaseRequest<Array<{ id: string; sales_spec: string | null; spec_value: number | null; spec_unit: string | null }>>(
    `product_catalog?select=id,sales_spec,spec_value,spec_unit&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${ids})&limit=100`
  );
  const specs = new Map(rows.map((row) => [row.id, catalogDisplaySpec(row)]));
  return { ...result, items: result.items.map((item) => ({ ...item, spec: (item.spec || "").trim() || specs.get(item.id) || "" })) };
}
export const pricingDocumentsRepository: PricingDocumentsRepository = {
  async request<T>(scope: DocumentScope, action: string, payload: object): Promise<T> {
    const result = await supabaseRequest<T>("rpc/pricing_p1", {
      method: "POST",
      body: JSON.stringify({
        p_company: scope.companyId,
        p_actor: scope.actor,
        p_manager: scope.manager,
        p_action: action,
        p_payload: payload,
      }),
    });
    if (action === "list") return withDocumentRecalculations(scope.companyId, result);
    if (action === "catalog") return withCatalogSpecs(scope.companyId, result as CatalogResult) as Promise<T>;
    return result;
  },
};
