import { kstToday } from "../shared/kst-date";
/** Historical actual sales prices; never a base price or fixed-price agreement. */
export type CustomerItemImportRow = {
  customerId: string;
  productId: string;
  salesUnit: string;
  lastPrice: number;
  lastDate: string;
  taxType: "taxable" | "exempt" | "unknown";
  priceIncludesTax: boolean | null;
};

export class CustomerItemImportError extends Error {}

export function parseCustomerItemImport(input: unknown): CustomerItemImportRow[] {
  const fail = (): never => { throw new CustomerItemImportError("거래처·상품·판매 단위·실제 단가·거래일·과세 정보를 확인해 주세요."); };
  if (!Array.isArray(input) || !input.length || input.length > 1000) return fail();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const keys = ["customerId", "productId", "salesUnit", "lastPrice", "lastDate", "taxType", "priceIncludesTax"];
  const seen = new Set<string>();
  const today = kstToday();
  return input.map((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return fail();
    const value = row as Record<string, unknown>;
    if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) return fail();
    const { customerId, productId, salesUnit, lastPrice, lastDate, taxType, priceIncludesTax } = value;
    if (typeof customerId !== "string" || !uuid.test(customerId) || typeof productId !== "string" || !uuid.test(productId)
      || typeof salesUnit !== "string" || !salesUnit.trim() || salesUnit.trim().length > 40
      || typeof lastPrice !== "number" || !Number.isSafeInteger(lastPrice) || lastPrice < 0 || lastPrice > 1_000_000_000_000
      || typeof lastDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate) || lastDate < "1900-01-01" || lastDate > today
      || !Number.isFinite(Date.parse(lastDate)) || new Date(lastDate).toISOString().slice(0, 10) !== lastDate
      || (taxType !== "taxable" && taxType !== "exempt" && taxType !== "unknown")
      || (taxType === "unknown" ? priceIncludesTax !== null : typeof priceIncludesTax !== "boolean")) return fail();
    if (priceIncludesTax !== null && typeof priceIncludesTax !== "boolean") return fail();
    const key = `${customerId.toLowerCase()}:${productId.toLowerCase()}:${salesUnit.trim()}`;
    if (seen.has(key)) return fail();
    seen.add(key);
    return { customerId: customerId.toLowerCase(), productId: productId.toLowerCase(), salesUnit: salesUnit.trim(), lastPrice, lastDate, taxType, priceIncludesTax };
  });
}
