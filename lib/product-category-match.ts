import { supabaseRequest as request } from "./store";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const words = (value: string) => value.toLocaleLowerCase("ko").split(/[\s/·._-]+/).filter(Boolean);

export function scoreCategoryMatch(
  companyCategory: string,
  majuCategory: string,
  businessType = "",
  industryKeys: string[] = [],
) {
  const source = new Set(words(companyCategory));
  const target = words(majuCategory);
  const nameScore = companyCategory.trim() === majuCategory.trim()
    ? 100
    : target.length
      ? Math.round((target.filter((word) => source.has(word)).length / target.length) * 70)
      : 0;
  const industryScore = industryKeys.some((key) => businessType.includes(key)) ? 30 : 0;
  return Math.min(100, nameScore + industryScore);
}

export async function listCategoryMatches(companyId: string) {
  const [categories, majuCategories, companies] = await Promise.all([
    request<Row[]>(`product_categories?select=id,name,level,maju_category_id&company_id=eq.${enc(companyId)}&is_active=eq.true&order=sort_order,name`),
    request<Row[]>("maju_categories?select=id,name,industry_keys&is_active=eq.true&order=sort_order,name"),
    request<Row[]>(`companies?select=business_type&id=eq.${enc(companyId)}&limit=1`),
  ]);
  const businessType = String(companies[0]?.business_type || "");
  const options = majuCategories.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    industryKeys: Array.isArray(row.industry_keys) ? row.industry_keys.map(String) : [],
  }));
  return {
    businessType,
    options: options.map(({ id, name }) => ({ id, name })),
    categories: categories.map((row) => {
      const ranked = options
        .map((option) => ({ id: option.id, name: option.name, score: scoreCategoryMatch(String(row.name), option.name, businessType, option.industryKeys) }))
        .sort((left, right) => right.score - left.score);
      return {
        id: String(row.id),
        level: Number(row.level),
        name: String(row.name),
        majuCategoryId: row.maju_category_id ? String(row.maju_category_id) : "",
        suggestion: ranked[0] || null,
      };
    }),
  };
}

export async function saveCategoryMatch(companyId: string, categoryId: string, majuCategoryId: string) {
  const rows = await request<Row[]>(
    `product_categories?select=id,maju_category_id&company_id=eq.${enc(companyId)}&id=eq.${enc(categoryId)}`,
    { method: "PATCH", body: JSON.stringify({ maju_category_id: majuCategoryId }) },
  );
  if (!rows[0]) throw new Error("회사 구분을 찾을 수 없습니다.");
  return { id: String(rows[0].id), majuCategoryId: String(rows[0].maju_category_id) };
}
