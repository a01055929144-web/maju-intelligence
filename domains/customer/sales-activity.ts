// CC-25: 매출처 "매출 상품"·"거래내역" 탭의 순수 규칙(읽기 전용). DB·React를 모른다.
import { storePriceSource, type StorePriceSource } from "../pricing/store-price";

export type SalesLine = { key: string; name: string; unit: string; quantity: number; unitPrice: number | null; date: string };
export type SalesProductRow = { key: string; name: string; unit: string; lastUnitPrice: number | null; quantity: number; lastDate: string; currentPrice: number | null; source: StorePriceSource | null };

/** 매출 전표 줄 + 매장 주문 줄을 상품별로 합친다: 최근 단가(가장 늦은 날짜)·수량 합·마지막 거래일. 최신순. */
export function aggregateSalesProducts(
  lines: SalesLine[],
  prices: ReadonlyMap<string, { base: number | null; agreement: { price: number; fromQuote: boolean } | null }>,
): SalesProductRow[] {
  const byKey = new Map<string, SalesProductRow>();
  for (const line of lines) {
    const row = byKey.get(line.key);
    if (!row) {
      byKey.set(line.key, { key: line.key, name: line.name, unit: line.unit, lastUnitPrice: line.unitPrice, quantity: line.quantity, lastDate: line.date, currentPrice: null, source: null });
    } else {
      row.quantity += line.quantity;
      if (line.date > row.lastDate || (line.date === row.lastDate && row.lastUnitPrice === null)) { row.lastDate = line.date; row.lastUnitPrice = line.unitPrice; row.name = line.name; row.unit = line.unit; }
    }
  }
  const rows = Array.from(byKey.values());
  for (const row of rows) {
    const price = prices.get(row.key);
    if (!price) continue;
    row.currentPrice = price.agreement?.price ?? price.base;
    row.source = price.agreement || price.base !== null ? storePriceSource(price.agreement) : null;
  }
  return rows.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name, "ko"));
}

export type SalesHistoryKind = "sale" | "order" | "receipt";
export type SalesHistoryRow = { id: string; kind: SalesHistoryKind; date: string; label: string; amount: number | null; status: string };

/** 매출 전표·주문·입금을 한 줄 목록으로. 날짜 내림차순, 같은 날은 입력 순서 유지. */
export function mergeSalesHistory(...groups: SalesHistoryRow[][]): SalesHistoryRow[] {
  return groups.flat().map((row, index) => ({ row, index })).sort((a, b) => b.row.date.localeCompare(a.row.date) || a.index - b.index).map((x) => x.row);
}

export type CustomerSalesSummary = { priceCount: number; lastDate: string; monthSales: number };
type Dated = { customerId: string; date: string; amount: number };

/** 매출처 목록 열: 매장 가격 수 · 최근 거래일 · 이번 달 매출(`month`=YYYY-MM). 매출 전표(확정)+매장 주문(취소 제외)을 탭과 같은 기준으로 합친다. */
export function summarizeCustomerSales(sales: Dated[], agreementCustomerIds: string[], month: string): Record<string, CustomerSalesSummary> {
  const out: Record<string, CustomerSalesSummary> = {};
  const row = (id: string) => (out[id] ||= { priceCount: 0, lastDate: "", monthSales: 0 });
  for (const id of agreementCustomerIds) row(id).priceCount += 1;
  for (const s of sales) {
    const r = row(s.customerId);
    if (s.date > r.lastDate) r.lastDate = s.date;
    if (s.date.startsWith(month)) r.monthSales += s.amount;
  }
  return out;
}
