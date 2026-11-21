/** New-layout editing only. Existing publication snapshots remain renderable when OFF. */
export function documentOfflineFlyerEnabled(companyId: string) {
  return process.env.PRICING_DOCUMENT_OFFLINE_FLYER_ENABLED === "true" && Boolean(companyId) &&
    (process.env.PRICING_DOCUMENT_OFFLINE_FLYER_COMPANY_IDS || "").split(",").map(id => id.trim()).filter(Boolean).includes(companyId);
}
