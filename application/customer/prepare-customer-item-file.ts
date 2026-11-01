import { CustomerItemImportError, parseCustomerItemImport } from "../../domains/customer/customer-item-import";
import type { ImportPreviewRow } from "../../domains/product/import-row-editor";

export const customerItemFileFields = [
  { key: "customerName", label: "거래처명" },
  { key: "productCode", label: "ERP 상품코드" },
  { key: "salesUnit", label: "판매 단위" },
  { key: "lastPrice", label: "최근 실제 단가" },
  { key: "lastDate", label: "거래일" },
  { key: "taxType", label: "과세 구분" },
  { key: "priceIncludesTax", label: "부가세 포함 여부" },
];
export type CustomerItemReferences = {
  customers: { id: string; name: string }[];
  products: { id: string; code: string }[];
};

/** Resolve exact company-owned names/codes. Never guess between duplicate matches. */
export function prepareCustomerItemFile(input: unknown, refs: CustomerItemReferences) {
  const fail = (message: string): never => { throw new CustomerItemImportError(message); };
  if (!Array.isArray(input) || !input.length || input.length > 1000) return fail("한 번에 1~1,000행을 가져올 수 있습니다.");
  const seen = new Set<number>();
  const fields = customerItemFileFields.map(field => field.key);
  const customerIds = new Map<string,string|null>();
  for (const item of refs.customers) {
    const key = item.name.trim();
    customerIds.set(key, customerIds.has(key) ? null : item.id);
  }
  const productIds = new Map<string,string|null>();
  for (const item of refs.products) {
    const key = item.code.trim();
    productIds.set(key, productIds.has(key) ? null : item.id);
  }
  const auditRows = input.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail("행 정보를 확인해 주세요.");
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.length > 80 || !Number.isSafeInteger(row.sourceRowNumber)
      || typeof row.sourceRowNumber !== "number" || row.sourceRowNumber < 2 || row.sourceRowNumber > 1_048_576
      || seen.has(row.sourceRowNumber)) return fail("원본 행 번호를 확인해 주세요.");
    seen.add(row.sourceRowNumber);
    for (const values of [row.originalValues, row.values]) {
      if (!values || typeof values !== "object" || Array.isArray(values)
        || Object.keys(values).length !== fields.length || Object.keys(values).some(key => !fields.includes(key))
        || Object.values(values).some(value => typeof value !== "string" || value.length > 500)) return fail("원본과 수정 값의 항목을 확인해 주세요.");
    }
    return { id: row.id, sourceRowNumber: row.sourceRowNumber, originalValues: row.originalValues, values: row.values } as ImportPreviewRow;
  });
  const rows = auditRows.map(row => {
    const v = row.values;
    if (!v.customerName.trim() || !v.productCode.trim()) return fail(`${row.sourceRowNumber}행: 거래처명과 ERP 상품코드를 입력해 주세요.`);
    const customerId = customerIds.get(v.customerName.trim());
    const productId = productIds.get(v.productCode.trim());
    if (!customerId || !productId) return fail(`${row.sourceRowNumber}행: 거래처명 또는 ERP 상품코드가 없거나 중복됩니다. 기존 자료를 확인해 주세요.`);
    const price = v.lastPrice.trim().replace(/원$/, "").trim();
    if (!price) return fail(`${row.sourceRowNumber}행: 최근 실제 단가를 입력해 주세요.`);
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(price)) return fail(`${row.sourceRowNumber}행: 실제 단가는 원 단위 숫자로 입력해 주세요.`);
    const taxType = ({ "": "unknown", "미확인": "unknown", unknown: "unknown", "과세": "taxable", taxable: "taxable", "면세": "exempt", exempt: "exempt" } as Record<string,string>)[v.taxType.trim()];
    const taxValue = v.priceIncludesTax.trim();
    const priceIncludesTax = taxType === "unknown" && !taxValue ? null
      : ["포함", "true"].includes(taxValue) ? true : ["별도", "false"].includes(taxValue) ? false : undefined;
    try {
      return parseCustomerItemImport([{ customerId, productId,
        salesUnit: v.salesUnit, lastPrice: Number(price.replaceAll(",", "")), lastDate: v.lastDate.trim(), taxType, priceIncludesTax }])[0];
    } catch { return fail(`${row.sourceRowNumber}행: 단가·거래일(YYYY-MM-DD)·판매 단위·과세 정보를 확인해 주세요.`); }
  });
  // Includes duplicate customer/product/unit validation across the complete batch.
  return { rows: parseCustomerItemImport(rows), auditRows };
}
