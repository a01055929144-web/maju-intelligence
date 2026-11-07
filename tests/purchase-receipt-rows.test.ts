import { describe, expect, it } from "vitest";
import { buildPurchaseReceiptRows, type PurchaseReceiptInputLine } from "../domains/pricing/purchase-receipt";

const lines: PurchaseReceiptInputLine[] = [
  { name: "오징어", unit: "EA", supplier: "매입처", rawCost: 4500, cost: 4500, quantity: 5, rowNumber: 3 },
  { name: "오징어", unit: "EA", supplier: "매입처", rawCost: 4600, cost: 4600, quantity: 2, rowNumber: 5 }
];

describe("purchase receipt source rows", () => {
  it("keeps different source transactions and replays the same file idempotently", () => {
    const input = { actorName: "대표", companyId: "c", fileName: "a.xlsx", lines, preserveSourceRows: true, receiptDate: "2026-11-04" };
    const rows = buildPurchaseReceiptRows(input);
    expect(rows.map((row) => row.unit_cost_ex_vat)).toEqual([4500, 4600]);
    expect(new Set(rows.map((row) => row.dedupe_key)).size).toBe(2);
    expect(buildPurchaseReceiptRows(input).map((row) => row.dedupe_key)).toEqual(rows.map((row) => row.dedupe_key));
  });

  it("uses a v2 namespace that cannot collide with legacy receipt keys", () => {
    const common = { actorName: "대표", companyId: "c", fileName: "a.xlsx", lines, receiptDate: "2026-11-04" };
    const legacyKeys = new Set(buildPurchaseReceiptRows(common).map((row) => row.dedupe_key));
    const rows = buildPurchaseReceiptRows({ ...common, preserveSourceRows: true });
    expect(rows.every((row) => String(row.dedupe_key).startsWith("v2|") && !legacyKeys.has(row.dedupe_key))).toBe(true);
  });

  it("keeps a corrected file row as new history while exact reuploads stay idempotent", () => {
    const common = { actorName: "대표", companyId: "c", fileName: "a.xlsx", preserveSourceRows: true, receiptDate: "2026-11-04" };
    const original = buildPurchaseReceiptRows({ ...common, lines: [lines[0]] })[0];
    const corrected = buildPurchaseReceiptRows({ ...common, lines: [{ ...lines[0], rawCost: 4700, cost: 4700, quantity: 6 }] })[0];
    expect(corrected.dedupe_key).not.toBe(original.dedupe_key);
  });
});
