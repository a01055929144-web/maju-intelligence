import { purchaseLineKey } from "@/domains/pricing/purchase-import";

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

export function buildPurchaseReceiptRows(input: { companyId: string; receiptDate: string; fileName: string; actorName: string; lines: readonly PurchaseReceiptInputLine[] }) {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const line of input.lines) {
    const name = text(line.name);
    const unitPrice = num(line.rawCost, 1_000_000_000);
    const cost = num(line.cost, 1_000_000_000);
    if (!name || unitPrice === null || cost === null) continue;
    const spec = text(line.spec, 120);
    const supplier = text(line.supplier, 120);
    const lineKey = purchaseLineKey(name, spec);
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
      product_name: name,
      quantity: add("quantity", num(line.quantity)),
      raw_values: Array.isArray(line.raw) ? line.raw.slice(0, 40).map((cell) => text(cell, 200)) : [],
      receipt_date: input.receiptDate,
      source_row_number: typeof line.rowNumber === "number" ? line.rowNumber : null,
      spec: spec || null,
      supplier_name: supplier || null,
      supply_amount: add("supply_amount", num(line.supplyAmount)),
      total_amount: add("total_amount", num(line.totalAmount)),
      unit: text(line.unit, 40) || null,
      unit_cost_ex_vat: cost,
      unit_price: unitPrice,
      vat_amount: add("vat_amount", num(line.vatAmount))
    });
  }
  return Array.from(byKey.values());
}
