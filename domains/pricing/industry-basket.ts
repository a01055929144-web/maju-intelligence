export const BASKET_INDUSTRIES = ["한식", "중식", "일식", "양식", "분식", "카페/디저트", "주점", "치킨/고깃집", "기타"] as const;
export type BasketIndustry = (typeof BASKET_INDUSTRIES)[number];

export type IndustryBasketInput = { productCatalogId: string; defaultQty: number; isCore: boolean; sortOrder: number };

export function validateIndustryBasket(industry: string, rows: IndustryBasketInput[]) {
  if (!BASKET_INDUSTRIES.includes(industry as BasketIndustry)) throw new Error("업종을 확인해 주세요.");
  if (rows.length > 100) throw new Error("업종별 기본 품목은 100개까지 저장할 수 있습니다.");
  if (new Set(rows.map((row) => row.productCatalogId)).size !== rows.length) throw new Error("같은 품목을 두 번 담을 수 없습니다.");
  return rows.map((row, index) => {
    if (!/^[0-9a-f-]{36}$/i.test(row.productCatalogId)) throw new Error("품목을 확인해 주세요.");
    if (!Number.isFinite(row.defaultQty) || row.defaultQty <= 0 || row.defaultQty > 1_000_000) throw new Error("기본 수량을 확인해 주세요.");
    return { ...row, defaultQty: Math.round(row.defaultQty * 1000) / 1000, sortOrder: index };
  });
}

export function documentSharePreview(input: { companyName: string; documentTitle: string; industry?: string; validUntil: string }) {
  const company = input.companyName.trim().slice(0, 80) || "공급사";
  const title = input.documentTitle.trim().slice(0, 70) || "단가표";
  return {
    title: `${company} · ${title}`.slice(0, 160),
    description: [input.industry?.trim() ? `${input.industry.trim()} 업종` : "", input.validUntil ? `${input.validUntil}까지` : ""]
      .filter(Boolean).join(" · ").slice(0, 300) || "공유 단가표",
  };
}
