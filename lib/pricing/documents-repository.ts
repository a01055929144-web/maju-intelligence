import { supabaseRequest } from "../store";
import type { PricingDocumentsRepository } from "../../application/pricing/documents";
export const pricingDocumentsRepository: PricingDocumentsRepository = {
  request: (scope, action, payload) =>
    supabaseRequest("rpc/pricing_p1", {
      method: "POST",
      body: JSON.stringify({
        p_company: scope.companyId,
        p_actor: scope.actor,
        p_manager: scope.manager,
        p_action: action,
        p_payload: payload,
      }),
    }),
};
