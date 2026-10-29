import { supabaseRequest } from "../store";
import type { PriceSheetRepository } from "../../application/pricing/manage-price-sheets";
export const priceSheetRepository: PriceSheetRepository = {
  read: (companyId, query) => supabaseRequest("rpc/pricing_p0_state", { method: "POST", body: JSON.stringify({ p_company: companyId, p_search: query?.search ?? "", p_page: query?.page ?? 1 }) }),
  async execute(companyId, command) {
    await supabaseRequest("rpc/pricing_p0_command", { method: "POST", body: JSON.stringify({ p_company: companyId, p_command: command }) });
  }
};
