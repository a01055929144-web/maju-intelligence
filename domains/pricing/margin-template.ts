import { calculatePrice } from "./price-rules";

const categoryParts = (category: string) => category.split(">").map((part) => part.trim()).filter(Boolean);

// CC-19a: 거래처 등급별 마진 템플릿의 판매가 계산(순수 함수). 저장하지 않고 계산한다 — 문서 확정 때 그 값으로 스냅샷.
export type MarginTemplate = {
  /** 템플릿 기본 마진(%) — 템플릿에 없는 값은 회사 기본이 아니라 이것으로 채운다(등급이 섞이지 않게). */
  margin: number;
  rounding: number;
  categories: { category: string; margin: number }[];
  items: { productId: string; margin: number | null; directPrice: number | null }[];
};

export type TemplatePrice = { price: number; margin: number | null; source: "direct" | "item" | "category" | "default" };

/** 우선순위: 템플릿 상품 직접 단가 > 상품 마진 > 가장 깊은 분류 마진 > 템플릿 기본 마진. */
export function templatePrice(template: MarginTemplate, product: { id: string; category: string; cost: number }): TemplatePrice {
  const item = template.items.find((entry) => entry.productId === product.id);
  if (item?.directPrice != null) return { price: item.directPrice, margin: null, source: "direct" };
  if (item?.margin != null) return { price: calculatePrice(product.cost, item.margin, template.rounding), margin: item.margin, source: "item" };
  const have = categoryParts(product.category);
  let best: { depth: number; margin: number } | null = null;
  for (const entry of template.categories) {
    const want = categoryParts(entry.category);
    if (want.length <= have.length && want.every((part, i) => have[i] === part) && (!best || want.length > best.depth)) best = { depth: want.length, margin: entry.margin };
  }
  if (best) return { price: calculatePrice(product.cost, best.margin, template.rounding), margin: best.margin, source: "category" };
  return { price: calculatePrice(product.cost, template.margin, template.rounding), margin: template.margin, source: "default" };
}
