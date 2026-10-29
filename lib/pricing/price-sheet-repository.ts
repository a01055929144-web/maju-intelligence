import { supabaseRequest } from "../store";
import type { PriceSheetRepository } from "../../application/pricing/manage-price-sheets";
export const priceSheetRepository: PriceSheetRepository = {
  read: companyId => supabaseRequest("rpc/pricing_p0_state", { method: "POST", body: JSON.stringify({ p_company: companyId }) }),
  async execute(companyId, command) {
    await supabaseRequest("rpc/pricing_p0_command", { method: "POST", body: JSON.stringify({ p_company: companyId, p_command: command }) });
  }
};
