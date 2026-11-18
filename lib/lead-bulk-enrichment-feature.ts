export function leadBulkEnrichmentEnabled(companyId: string) {
  return process.env.LEAD_BULK_ENRICHMENT_ENABLED === "true"
    && (process.env.FEATURE_LEAD_BULK_ENRICHMENT_COMPANY_IDS || "").split(",").some((id) => id.trim() === companyId);
}

export function leadBulkDailyCap() {
  const value = Number(process.env.LEAD_BULK_ENRICHMENT_DAILY_CAP || 200);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1000) : 200;
}

export function leadBulkMinIntervalMs() {
  const perSecond = Number(process.env.LEAD_BULK_ENRICHMENT_REQUESTS_PER_SECOND || 1);
  return Math.ceil(1000 / (Number.isFinite(perSecond) && perSecond > 0 ? Math.min(perSecond, 2) : 1));
}

export function leadBulkRunBudgetMs() {
  const value = Number(process.env.LEAD_BULK_ENRICHMENT_RUN_BUDGET_MS || 45_000);
  return Number.isInteger(value) && value >= 1_000 ? Math.min(value, 45_000) : 45_000;
}

