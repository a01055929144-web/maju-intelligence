import { lineFromCatalog, type CatalogChoice, type PrintLine } from "./document";

export type DocumentExcelRow = { code: string; name: string; price: number | null };
const norm = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("ko").replace(/\s+/g, "");

export function parseDocumentExcelRows(rows: Array<Record<string, unknown>>): DocumentExcelRow[] {
  if (!rows.length || rows.length > 100) throw new Error("엑셀에는 1~100개 품목을 넣어 주세요.");
  return rows.map((row, index) => {
    const code = String(row["ERP 코드"] ?? row["상품코드"] ?? row["품목코드"] ?? "").trim();
    const name = String(row["품목명"] ?? row["상품명"] ?? row["품목"] ?? "").trim();
    const rawPrice = String(row["판매가"] ?? "").replaceAll(",", "").trim();
    const price = rawPrice ? Number(rawPrice) : null;
    if (!code && !name) throw new Error(`${index + 2}행에 ERP 코드 또는 품목명이 필요합니다.`);
    if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000_000))
      throw new Error(`${index + 2}행의 판매가를 확인해 주세요.`);
    return { code, name, price };
  });
}

export function matchDocumentExcelRow(row: DocumentExcelRow, catalog: readonly CatalogChoice[]): CatalogChoice | null {
  if (row.code) {
    const matches = catalog.filter((item) => norm(item.productCode || "") === norm(row.code));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }
  if (!row.name) return null;
  const matches = catalog.filter((item) => norm(item.name) === norm(row.name) || norm(item.displayName) === norm(row.name));
  return matches.length === 1 ? matches[0] : null;
}

export function importDocumentExcelRows(rows: readonly DocumentExcelRow[], catalog: readonly CatalogChoice[], existing: readonly PrintLine[]) {
  const known = new Set(existing.map((line) => line.productId));
  const added: PrintLine[] = [];
  const unmatched: string[] = [];
  for (const row of rows) {
    const item = matchDocumentExcelRow(row, catalog);
    if (!item) { unmatched.push(row.code || row.name); continue; }
    if (known.has(item.id)) continue;
    known.add(item.id);
    added.push({ ...lineFromCatalog(item), price: row.price ?? item.price });
  }
  if (existing.length + added.length > 100) throw new Error("문서당 최대 100개 품목을 담을 수 있습니다.");
  return { added, unmatched };
}
