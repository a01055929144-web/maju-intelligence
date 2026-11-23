import { isHoliday, type HolidayRule } from "./order-rules";

export type CutoffRule = { cutoffDaysBefore: number; cutoffTime: string };
export type DeliveryCutoffRule = CutoffRule & { weekdays?: readonly number[]; holidays?: readonly HolidayRule[] };
export type CutoffSource = "company" | "territory" | "store" | "product";

/** A null product rule leaves the existing order path free to use its current policy. */
export function effectiveCutoff(
  company: DeliveryCutoffRule & { weekdays: readonly number[] },
  territory: DeliveryCutoffRule | null,
  store: DeliveryCutoffRule | null,
  product: CutoffRule | null,
  deliveryDate: string
): { cutoffAtKst: string; source: CutoffSource } | null {
  const date = new Date(`${deliveryDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== deliveryDate) throw new Error("배송일을 확인해 주세요.");
  const weekdays = store?.weekdays ?? territory?.weekdays ?? company.weekdays;
  if (!weekdays.includes(date.getUTCDay()) || isHoliday(deliveryDate, store?.holidays ?? territory?.holidays ?? company.holidays ?? [])) return null;

  let earliest: { cutoffAtKst: string; source: CutoffSource } | null = null;
  const rules: readonly [CutoffSource, CutoffRule | null][] = [
    ["company", company], ["territory", territory], ["store", store], ["product", product]
  ];
  for (const [source, rule] of rules) {
    if (!rule) continue;
    if (!Number.isInteger(rule.cutoffDaysBefore) || rule.cutoffDaysBefore < 0 || rule.cutoffDaysBefore > 365 ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.cutoffTime)) throw new Error("주문 마감 설정을 확인해 주세요.");
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() - rule.cutoffDaysBefore);
    const cutoffAtKst = `${day.toISOString().slice(0, 10)}T${rule.cutoffTime}:00+09:00`;
    if (!earliest || cutoffAtKst < earliest.cutoffAtKst) earliest = { cutoffAtKst, source };
  }
  return earliest;
}

