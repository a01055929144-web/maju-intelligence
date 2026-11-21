import { supabaseRequest } from "./store";

export type DistributorIndustryCategory = { id: string; displayName: string; status: "active" | "retired" };
export type DistributorIndustryList = { companyId: string; categories: DistributorIndustryCategory[]; assignedCategoryIds: string[] };
export type DistributorIndustryImpact = {
  activeConnectionCount: number;
  affectedStoreCount: number;
  assignedCompanyCount?: number;
  beforeCategoryIds?: string[];
  afterCategoryIds?: string[];
  changed?: boolean;
};

const fixtureCategories: DistributorIndustryCategory[] = [
  { id: "40000000-0000-4000-8000-000000000001", displayName: "농산 유통", status: "active" },
  { id: "40000000-0000-4000-8000-000000000002", displayName: "주류 유통", status: "active" }
];

export function adminDistributorIndustriesEnabled(companyId: string | null | undefined) {
  return Boolean(companyId) && getAdminDistributorIndustriesEnabledCompanyIds().includes(companyId as string);
}

export function getAdminDistributorIndustriesEnabledCompanyIds() {
  return (process.env.FEATURE_ADMIN_DISTRIBUTOR_INDUSTRIES_COMPANY_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
}

function fixturesEnabled() {
  return process.env.CI_ADMIN_INDUSTRY_FIXTURES === "enabled" && process.env.VERCEL_ENV !== "production";
}

function rpc<T>(name: string, body: Record<string, unknown>) {
  return supabaseRequest<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

export function listDistributorIndustries(companyId: string) {
  if (fixturesEnabled()) return Promise.resolve({ companyId, categories: fixtureCategories, assignedCategoryIds: [fixtureCategories[0].id] });
  return rpc<DistributorIndustryList>("admin_list_distributor_industries", { p_company: companyId });
}

export function previewDistributorIndustryCategory(categoryId: string) {
  if (fixturesEnabled()) return Promise.resolve({ assignedCompanyCount: 2, activeConnectionCount: 3, affectedStoreCount: 3 });
  return rpc<DistributorIndustryImpact>("preview_distributor_industry_category_impact", { p_category: categoryId });
}

export function previewCompanyDistributorIndustries(companyId: string, categoryIds: string[]) {
  if (fixturesEnabled()) return Promise.resolve({ beforeCategoryIds: [fixtureCategories[0].id], afterCategoryIds: categoryIds, changed: true, activeConnectionCount: 3, affectedStoreCount: 3 });
  return rpc<DistributorIndustryImpact>("preview_company_distributor_industries", { p_company: companyId, p_category_ids: categoryIds });
}

export function saveDistributorIndustryCategory(input: { categoryId?: string; displayName: string; status: "active" | "retired"; actorName: string; requestKey: string }) {
  if (fixturesEnabled()) return Promise.resolve({ categoryId: input.categoryId || "40000000-0000-4000-8000-000000000003", alreadyApplied: false });
  return rpc<{ categoryId: string; alreadyApplied: boolean }>("admin_save_distributor_industry_category", {
    p_category_id: input.categoryId || null, p_display_name: input.displayName, p_status: input.status,
    p_actor_name: input.actorName, p_request_key: input.requestKey
  });
}

export function setCompanyDistributorIndustries(input: { companyId: string; categoryIds: string[]; actorName: string; requestKey: string }) {
  if (fixturesEnabled()) return Promise.resolve({ companyId: input.companyId, alreadyApplied: false });
  return rpc<{ companyId: string; alreadyApplied: boolean }>("admin_set_company_distributor_industries", {
    p_company: input.companyId, p_category_ids: input.categoryIds, p_actor_name: input.actorName, p_request_key: input.requestKey
  });
}
