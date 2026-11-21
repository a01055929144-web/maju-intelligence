export function commonCategoryMappingEnabled(
  companyId: string | null | undefined,
  allowlist = process.env.FEATURE_COMMON_CATEGORY_MAPPING_COMPANY_IDS || "",
) {
  return Boolean(companyId) && allowlist.split(",").some((id) => id.trim() === companyId);
}
