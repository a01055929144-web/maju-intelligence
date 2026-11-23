/** CX-74 guidance remains OFF until a company is explicitly enabled. */
export function storeOrderCutoffGuidanceEnabled(companyId: string) {
  return Boolean(companyId) && process.env.STORE_ORDER_CUTOFF_GUIDANCE_ENABLED === "true" &&
    (process.env.STORE_ORDER_CUTOFF_GUIDANCE_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
