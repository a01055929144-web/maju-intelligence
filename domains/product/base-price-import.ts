export type BasePriceImportField = "effectiveDate" | "productCode" | "productName" | "baseCost" | "basePrice";
export type BasePriceImportMapping = Partial<Record<BasePriceImportField, string>>;
export type BasePriceRawRow = Record<string, unknown>;

export const basePriceImportFields: Array<{ key: BasePriceImportField; label: string; required: boolean }> = [
  { key: "effectiveDate", label: "적용일", required: true },
  { key: "productCode", label: "상품 코드", required: false },
  { key: "productName", label: "상품명", required: false },
  { key: "baseCost", label: "기준 매입가", required: true },
  { key: "basePrice", label: "기준 매출가", required: true },
];

const aliases: Record<BasePriceImportField, string[]> = {
  effectiveDate: ["적용일", "기준일", "일자", "날짜"],
  productCode: ["상품코드", "품목코드", "기본코드", "코드"],
  productName: ["상품명", "품명", "제품명"],
  baseCost: ["기준매입가", "참고매입가", "매입참고단가", "기준원가"],
  basePrice: ["기준매출가", "참고매출가", "판매참고단가", "기준판매가"],
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[\s_\-./()[\]]/g, "");
const text = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
const money = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[,원\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
const date = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value).replace(/[./]/g, "-");
  const matched = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!matched) return undefined;
  const iso = `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`;
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? undefined : iso;
};

export function suggestBasePriceImportMapping(headers: string[]): BasePriceImportMapping {
  return basePriceImportFields.reduce<BasePriceImportMapping>((mapping, field) => {
    const header = headers.find((candidate) => aliases[field.key].some((alias) => normalize(alias) === normalize(candidate)));
    if (header) mapping[field.key] = header;
    return mapping;
  }, {});
}

export function buildBasePriceImportPreview(rows: BasePriceRawRow[], mapping: BasePriceImportMapping) {
  if (!mapping.effectiveDate || !mapping.baseCost || !mapping.basePrice) throw new Error("적용일, 기준 매입가, 기준 매출가 열을 선택해주세요.");
  if (!mapping.productCode && !mapping.productName) throw new Error("상품 코드 또는 상품명 열을 선택해주세요.");
  const excluded: Record<string, number> = {};
  const skip = (reason: string) => { excluded[reason] = (excluded[reason] || 0) + 1; };
  const items = rows.flatMap((row, index) => {
    const effectiveDate = date(row[mapping.effectiveDate!]);
    const baseCost = money(row[mapping.baseCost!]);
    const basePrice = money(row[mapping.basePrice!]);
    const productCode = mapping.productCode ? text(row[mapping.productCode]) : "";
    const productName = mapping.productName ? text(row[mapping.productName]) : "";
    if (!productCode && !productName) { skip("상품 식별값 없음"); return []; }
    if (!effectiveDate) { skip("적용일 오류"); return []; }
    if (baseCost == null || basePrice == null) { skip("기준 단가 오류"); return []; }
    return [{ sourceRowNumber: index + 2, effectiveDate, productCode, productName, baseCost, basePrice }];
  });
  return { excluded, excludedCount: Object.values(excluded).reduce((sum, count) => sum + count, 0), items };
}
