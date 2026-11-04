import { purchaseLineKey } from "./purchase-import";

/** 11/4: 매입 기록 한 줄(날짜·매입처·품목 단위로 합칩니다). 순수 규칙만 둡니다. */
export type PurchaseReceiptInputLine = {
  name: string;
  spec?: string;
  unit?: string;
  code?: string;
  supplier?: string;
  rawCost: number;
  cost: number;
  vatIncluded?: boolean;
  taxType?: "taxable" | "exempt";
  productId?: string;
  quantity?: number;
  supplyAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
  rowNumber?: number;
  raw?: string[];
};

const num = (value: unknown, max = 1_000_000_000_000) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const text = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);

export function buildPurchaseReceiptRows(input: { companyId: string; receiptDate: string; fileName: string; actorName: string; lines: readonly PurchaseReceiptInputLine[]; knownProductIds?: ReadonlySet<string> }) {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const line of input.lines) {
    const name = text(line.name);
    const unitPrice = num(line.rawCost, 1_000_000_000);
    const cost = num(line.cost, 1_000_000_000);
    if (!name || unitPrice === null || cost === null) continue;
    const spec = text(line.spec, 120);
    const supplier = text(line.supplier, 120);
    const lineKey = purchaseLineKey(name, `${spec}${text(line.unit, 40)}`);
    const dedupeKey = `${input.receiptDate}|${purchaseLineKey(supplier, "")}|${lineKey}`.slice(0, 400);
    const previous = byKey.get(dedupeKey);
    const add = (field: string, value: number | null) => (value === null ? (previous?.[field] as number | null) ?? null : ((previous?.[field] as number | null) ?? 0) + value);
    byKey.set(dedupeKey, {
      company_id: input.companyId,
      created_by_name: text(input.actorName, 80),
      dedupe_key: dedupeKey,
      erp_code: text(line.code, 80) || null,
      file_name: input.fileName || null,
      line_key: lineKey,
      price_includes_vat: Boolean(line.vatIncluded),
      product_catalog_id: line.productId && input.knownProductIds?.has(line.productId) ? line.productId : (previous?.product_catalog_id as string | null) ?? null,
      product_name: name,
      quantity: add("quantity", num(line.quantity)),
      raw_values: Array.isArray(line.raw) ? line.raw.slice(0, 40).map((cell) => text(cell, 200)) : [],
      receipt_date: input.receiptDate,
      source_row_number: typeof line.rowNumber === "number" ? line.rowNumber : null,
      spec: spec || null,
      supplier_name: supplier || null,
      supply_amount: add("supply_amount", num(line.supplyAmount)),
      tax_type: line.taxType === "taxable" || line.taxType === "exempt" ? line.taxType : null,
      total_amount: add("total_amount", num(line.totalAmount)),
      unit: text(line.unit, 40) || null,
      unit_cost_ex_vat: cost,
      unit_price: unitPrice,
      vat_amount: add("vat_amount", num(line.vatAmount))
    });
  }
  return Array.from(byKey.values());
}

/**
 * 11/4: 매입 파일의 부가세 칸으로 상품 과세 구분을 채웁니다.
 * - 비어 있는 상품만 채우고, 이미 정해진 값과 다르면 바꾸지 않고 '확인 필요'로 셉니다.
 * - 한 파일 안에서 같은 상품이 과세·면세로 엇갈리면 건드리지 않습니다.
 */
export function planProductTaxTypes(lines: readonly PurchaseReceiptInputLine[], current: ReadonlyMap<string, string | null>) {
  const seen = new Map<string, "taxable" | "exempt" | "mixed">();
  for (const line of lines) {
    if (!line.productId || (line.taxType !== "taxable" && line.taxType !== "exempt")) continue;
    const before = seen.get(line.productId);
    seen.set(line.productId, before && before !== line.taxType ? "mixed" : line.taxType);
  }
  const fill: Array<{ productId: string; taxType: "taxable" | "exempt" }> = [];
  const conflicts: string[] = [];
  for (const [productId, taxType] of Array.from(seen.entries())) {
    if (!current.has(productId)) continue;
    const existing = current.get(productId);
    if (taxType === "mixed") { conflicts.push(productId); continue; }
    if (!existing) fill.push({ productId, taxType });
    else if (existing !== taxType) conflicts.push(productId);
  }
  return { conflicts, fill };
}

export type ProductFieldEdit = { name?: string; spec?: string; unit?: string; taxType?: "taxable" | "exempt" | "" };

/** "10kg" → 값 10 + 단위 kg, 숫자로 시작하지 않으면 단위 칸에 그대로 둡니다. */
export function splitSpec(spec: string) {
  const trimmed = spec.trim();
  if (!trimmed) return { spec_unit: null as string | null, spec_value: null as number | null };
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match && Number.isFinite(Number(match[1]))) return { spec_unit: match[2].trim() || null, spec_value: Number(match[1]) };
  return { spec_unit: trimmed.slice(0, 60), spec_value: null };
}

export function buildProductFieldPatch(edit: ProductFieldEdit): { values: Record<string, unknown> } | { error: string } {
  const values: Record<string, unknown> = {};
  if (edit.name !== undefined) {
    const name = edit.name.trim();
    if (!name) return { error: "품목명은 비울 수 없습니다." };
    values.canonical_name = name.slice(0, 200);
    values.purchase_product_name = name.slice(0, 200);
  }
  if (edit.spec !== undefined) Object.assign(values, splitSpec(edit.spec));
  if (edit.unit !== undefined) {
    const unit = edit.unit.trim();
    if (!unit) return { error: "단위는 비울 수 없습니다." };
    values.sales_unit = unit.slice(0, 40);
    values.purchase_unit = unit.slice(0, 40);
  }
  if (edit.taxType !== undefined) values.tax_type = edit.taxType === "taxable" || edit.taxType === "exempt" ? edit.taxType : null;
  return Object.keys(values).length ? { values } : { error: "바꿀 내용이 없습니다." };
}

/** 나중에 올린 파일로 상품의 빈 칸(규격·단위)을 채웁니다. 이미 값이 있으면 그대로 둡니다. */
export function planMissingProductFields(lines: readonly PurchaseReceiptInputLine[], current: ReadonlyMap<string, { spec: string; unit: string }>) {
  const patches = new Map<string, Record<string, unknown>>();
  for (const line of lines) {
    if (!line.productId) continue;
    const product = current.get(line.productId);
    if (!product) continue;
    const patch = patches.get(line.productId) || {};
    if (!product.spec && line.spec?.trim() && patch.spec_unit === undefined) Object.assign(patch, splitSpec(line.spec));
    if (!product.unit && line.unit?.trim() && patch.sales_unit === undefined) Object.assign(patch, { purchase_unit: line.unit.trim().slice(0, 40), sales_unit: line.unit.trim().slice(0, 40) });
    if (Object.keys(patch).length) patches.set(line.productId, patch);
  }
  return Array.from(patches.entries()).map(([productId, values]) => ({ productId, values }));
}

export type PurchaseHistoryRow = {
  receipt_date: string;
  line_key: string;
  product_name: string;
  spec: string | null;
  unit: string | null;
  supplier_name: string | null;
  quantity: number | string | null;
  unit_cost_ex_vat: number | string;
  total_amount?: number | string | null;
};

export type PurchaseHistoryItem = {
  key: string;
  name: string;
  spec: string;
  unit: string;
  supplier: string;
  latestDate: string;
  latestCost: number;
  previousCost?: number;
  changeRate?: number;
  minCost: number;
  maxCost: number;
  totalQuantity: number;
  count: number;
  entries: Array<{ date: string; cost: number; quantity?: number }>;
};

/** 11/4: 매입 이력을 품목별로 묶고, 최근 단가·직전 단가·변동률·기간 수량을 계산합니다. */
export function summarizePurchaseHistory(rows: readonly PurchaseHistoryRow[]): PurchaseHistoryItem[] {
  const groups = new Map<string, PurchaseHistoryRow[]>();
  for (const row of rows) {
    const key = `${row.line_key}|${row.supplier_name || ""}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => b.receipt_date.localeCompare(a.receipt_date));
    const entries = sorted.map((row) => ({ cost: Number(row.unit_cost_ex_vat) || 0, date: row.receipt_date, quantity: row.quantity == null ? undefined : Number(row.quantity) }));
    const latest = entries[0];
    const previous = entries.find((entry) => entry.date < latest.date && entry.cost !== latest.cost) || entries[1];
    const costs = entries.map((entry) => entry.cost);
    return {
      changeRate: previous && previous.cost ? Math.round((latest.cost / previous.cost - 1) * 1000) / 10 : undefined,
      count: entries.length,
      entries,
      key,
      latestCost: latest.cost,
      latestDate: latest.date,
      maxCost: Math.max(...costs),
      minCost: Math.min(...costs),
      name: sorted[0].product_name,
      previousCost: previous?.cost,
      spec: sorted[0].spec || "",
      supplier: sorted[0].supplier_name || "",
      totalQuantity: entries.reduce((sum, entry) => sum + (entry.quantity || 0), 0),
      unit: sorted[0].unit || ""
    };
  }).sort((a, b) => b.latestDate.localeCompare(a.latestDate) || Math.abs(b.changeRate || 0) - Math.abs(a.changeRate || 0));
}
