export function storeLinkDetailEnabled(companyId: string) {
  return process.env.STORE_LINK_DETAIL_ENABLED === "true" && Boolean(companyId) &&
    (process.env.STORE_LINK_DETAIL_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
