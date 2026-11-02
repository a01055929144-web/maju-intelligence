import { supabaseRequest } from "../store";
import type { DocumentScope, PricingDocumentsRepository } from "../../application/pricing/documents";
import { withDocumentRecalculations } from "./document-recalculation";
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
    return action === "list" ? withDocumentRecalculations(scope.companyId, result) : result;
  },
};
