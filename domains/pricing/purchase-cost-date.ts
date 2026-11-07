import type { PurchaseImportLine } from "./purchase-import";

export const MAX_PURCHASE_DATE_BODY_BYTES = 4_000_000;
export type DatedPurchaseLine = PurchaseImportLine & { productId?: string; supplierProductId?: string };
export type PurchaseDateRow = {
  replaceUndatedCurrent?: boolean; expectedPurchasePrice?: number;
  productId: string; supplierProductId?: string; priceDate: string; cost: number; supplierCost?: number;
  selectedSourceRowNumber: number; priceSelected: boolean; priceHeld: boolean; lineKey: string;
  productName: string; spec: string; unit: string; supplierName: string; erpCode: string;
  quantity?: number; unitPrice: number; priceIncludesVat: boolean; taxType?: "taxable" | "exempt";
  supplyAmount?: number; vatAmount?: number; totalAmount?: number; rawValues: string[];
};
export const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
export const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const money = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 999999999999.99 && Number(value.toFixed(2)) === value;

/** Price selection may collapse candidates; receipt rows always come from the original parser output. */
export function buildPurchaseDateRows(lines: readonly DatedPurchaseLine[], selectedRows: readonly number[], heldRows: readonly number[]): PurchaseDateRow[] {
  const selected = new Set(selectedRows), held = new Set(heldRows);
  const groups = new Map<string, DatedPurchaseLine[]>();
  for (const line of lines) {
    if (!line.productId || !validDate(line.purchaseDate)) throw new Error("원본 거래의 상품 연결과 적용일을 확인해 주세요.");
    const key = `${line.productId}|${line.purchaseDate}`;
    const group = groups.get(key) || []; group.push(line); groups.set(key, group);
  }
  const chosen = new Set<number>(), heldChosen = new Set<number>();
  for (const group of Array.from(groups.values())) {
    const holds = group.filter(line => held.has(line.rowNumber));
    const picks = group.filter(line => selected.has(line.rowNumber));
    if (holds.length && picks.length) throw new Error("같은 상품·날짜에 선택과 보류가 함께 있습니다.");
    if (holds.length) heldChosen.add(holds[0].rowNumber);
    else if (picks.length && new Set(picks.map(line => line.cost)).size === 1) chosen.add(picks[0].rowNumber);
    else throw new Error("상품·날짜마다 적용할 원문 행 또는 보류를 확인해 주세요.");
  }
  const rows = lines.map(line => ({ productId: line.productId!, supplierProductId: line.supplierProductId, priceDate: line.purchaseDate!,
    cost: line.cost, supplierCost: line.supplierProductId ? line.cost : undefined, selectedSourceRowNumber: line.rowNumber,
    priceSelected: chosen.has(line.rowNumber), priceHeld: heldChosen.has(line.rowNumber), lineKey: line.lineKey,
    productName: line.name, spec: line.spec, unit: line.unit, supplierName: line.supplier, erpCode: line.code,
    quantity: line.quantity, unitPrice: line.rawCost, priceIncludesVat: line.vatIncluded, taxType: line.taxType,
    supplyAmount: line.supplyAmount, vatAmount: line.vatAmount, totalAmount: line.totalAmount, rawValues: line.raw }));
  if (!validPurchaseDateRows(rows)) throw new Error("저장할 원본 거래행을 확인해 주세요. 최대 5,000행까지 가능합니다.");
  return rows;
}

export function validPurchaseDateRows(value: unknown): value is PurchaseDateRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 5000) return false;
  const sourceRows = new Set<number>();
  const groups = new Map<string, { selected: number; held: number }>();
  const keys = new Set(["replaceUndatedCurrent", "expectedPurchasePrice", "productId", "supplierProductId", "priceDate", "cost", "supplierCost", "selectedSourceRowNumber", "priceSelected", "priceHeld", "lineKey", "productName", "spec", "unit", "supplierName", "erpCode", "quantity", "unitPrice", "priceIncludesVat", "taxType", "supplyAmount", "vatAmount", "totalAmount", "rawValues"]);
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(key => !keys.has(key))
      || !validId(row.productId) || (row.supplierProductId !== undefined && !validId(row.supplierProductId))
      || (row.replaceUndatedCurrent !== undefined && typeof row.replaceUndatedCurrent !== "boolean")
      || (row.replaceUndatedCurrent === true && (!row.priceSelected || !money(row.expectedPurchasePrice)))
      || (row.expectedPurchasePrice !== undefined && !money(row.expectedPurchasePrice))
      || !validDate(row.priceDate) || !money(row.cost) || !money(row.unitPrice)
      || (row.supplierProductId && !money(row.supplierCost))
      || !Number.isSafeInteger(row.selectedSourceRowNumber) || row.selectedSourceRowNumber < 1 || sourceRows.has(row.selectedSourceRowNumber)
      || typeof row.priceSelected !== "boolean" || typeof row.priceHeld !== "boolean" || typeof row.priceIncludesVat !== "boolean"
      || ["lineKey", "productName", "spec", "unit", "supplierName", "erpCode"].some(key => typeof row[key] !== "string" || row[key].length > 1000)
      || !row.productName.trim()
      || (row.taxType !== undefined && !["taxable", "exempt"].includes(row.taxType))
      || ["quantity", "supplyAmount", "vatAmount", "totalAmount"].some(key => row[key] !== undefined && (typeof row[key] !== "number" || !Number.isFinite(row[key]) || Math.abs(row[key]) > 999999999999.99))
      || !Array.isArray(row.rawValues) || row.rawValues.length > 200 || row.rawValues.some((cell: unknown) => typeof cell !== "string" || cell.length > 10000)) return false;
    sourceRows.add(row.selectedSourceRowNumber);
    const key = `${row.productId}|${row.priceDate}`;
    const group = groups.get(key) || { selected: 0, held: 0 };
    group.selected += Number(row.priceSelected); group.held += Number(row.priceHeld); groups.set(key, group);
  }
  return Array.from(groups.values()).every(group => group.selected === 1 && group.held === 0 || group.selected === 0 && group.held === 1);
}
