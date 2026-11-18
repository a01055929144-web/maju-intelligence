import { PricingInputError, type CatalogChoice, type PrintLine, type Promotion } from "./document";

/** Explicit draft review only. Never mutate catalog, promotions or publications. */
export function reviewDocumentTaxes(lines: readonly PrintLine[], catalog: readonly Pick<CatalogChoice, "id" | "taxType">[], promotions: readonly Pick<Promotion, "id" | "productId" | "taxType">[]) {
  const products = new Map(catalog.map(item => [item.id, item]));
  const offers = new Map(promotions.map(item => [item.id, item]));
  let toExempt = 0, toTaxable = 0;
  const next = lines.map(line => {
    const product = products.get(line.productId);
    if (!product || (product.taxType !== "taxable" && product.taxType !== "exempt"))
      throw new PricingInputError("현재 상품의 과세·면세를 확인하지 못했습니다. 상품관리에서 활성 상태와 세금 구분을 확인한 뒤 다시 반영해 주세요. 초안은 그대로 유지했습니다.");
    if (line.promotionId) {
      const offer = offers.get(line.promotionId);
      if (!offer || offer.productId !== line.productId || offer.taxType !== product.taxType)
        throw new PricingInputError("행사 원본과 상품의 세금 구분이 다르거나 행사를 찾을 수 없습니다. 행사 화면에서 대표·관리자가 원상품 세금 구분을 반영·저장한 뒤 다시 눌러 주세요. 초안은 그대로 유지했습니다.");
    }
    if (line.taxType === product.taxType) return line;
    if (product.taxType === "exempt") toExempt++; else toTaxable++;
    return { ...line, taxType: product.taxType };
  });
  return { lines: next, toExempt, toTaxable, changed: toExempt + toTaxable };
}
