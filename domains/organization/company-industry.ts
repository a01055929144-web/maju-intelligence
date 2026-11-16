export const COMPANY_INDUSTRY_OPTIONS = ["농산", "축산", "수산", "종합식자재", "주류"] as const;

export function isPresetCompanyIndustry(value: string) {
  return COMPANY_INDUSTRY_OPTIONS.includes(value.trim() as (typeof COMPANY_INDUSTRY_OPTIONS)[number]);
}
