/** Customer-facing order rules. Dates without a time are always KST calendar dates. */
export type MinimumOrderPolicy = "block" | "fee" | "notice";
export type HolidayRule =
  | { kind: "weekly"; weekday: number }
  | { kind: "fixed"; month: number; day: number }
  | { kind: "date"; date: string };

export type DeliveryPolicy = {
  weekdays: readonly number[];
  cutoffDaysBefore: 0 | 1 | 2;
  cutoffTime: string;
  minimumAmount: number;
  minimumPolicy: MinimumOrderPolicy;
  deliveryFee: number;
  holidays: readonly HolidayRule[];
};

export type OrderLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number | null;
  taxType: "taxable" | "exempt";
  priceIncludesTax?: boolean;
};

export function kstDateTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

function parseDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("날짜를 확인해 주세요.");
  const result = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== day)
    throw new Error("날짜를 확인해 주세요.");
  return result;
}

function addDays(day: string, days: number) {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validateDeliveryPolicy(policy: DeliveryPolicy) {
  if (!policy.weekdays.length || policy.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
    throw new Error("배송 요일을 선택해 주세요.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(policy.cutoffTime))
    throw new Error("마감 시각을 확인해 주세요.");
  if (![0, 1, 2].includes(policy.cutoffDaysBefore))
    throw new Error("마감일을 확인해 주세요.");
  if (![policy.minimumAmount, policy.deliveryFee].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1e12))
    throw new Error("최소 주문금액과 배송비를 확인해 주세요.");
  if (!["block", "fee", "notice"].includes(policy.minimumPolicy))
    throw new Error("최소 주문 처리 방식을 확인해 주세요.");
}

export function isHoliday(day: string, rules: readonly HolidayRule[]) {
  const date = parseDay(day);
  return rules.some((rule) =>
    rule.kind === "weekly" ? rule.weekday === date.getUTCDay()
      : rule.kind === "fixed" ? rule.month === date.getUTCMonth() + 1 && rule.day === date.getUTCDate()
        : rule.date === day,
  );
}

export function canOrderForDelivery(day: string, policy: DeliveryPolicy, now = new Date()) {
  validateDeliveryPolicy(policy);
  const date = parseDay(day);
  if (!policy.weekdays.includes(date.getUTCDay()) || isHoliday(day, policy.holidays)) return false;
  const cutoffDay = addDays(day, -policy.cutoffDaysBefore);
  const current = kstDateTime(now);
  return current.date < cutoffDay || (current.date === cutoffDay && current.time < policy.cutoffTime);
}

export function nextDeliveryDate(policy: DeliveryPolicy, now = new Date()) {
  const today = kstDateTime(now).date;
  for (let offset = 0; offset < 32; offset += 1) {
    const day = addDays(today, offset);
    if (canOrderForDelivery(day, policy, now)) return day;
  }
  return null;
}

export function summarizeOrder(lines: readonly OrderLineInput[], policy: DeliveryPolicy) {
  validateDeliveryPolicy(policy);
  if (!lines.length || lines.length > 100) throw new Error("품목은 1~100개를 담아 주세요.");
  let taxableSupply = 0;
  let exemptSupply = 0;
  let tax = 0;
  let marketCount = 0;
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 100000 ||
      Math.round(line.quantity * 1000) !== line.quantity * 1000)
      throw new Error("수량을 확인해 주세요.");
    if (line.unitPrice === null) { marketCount += 1; continue; }
    if (!Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0 || line.unitPrice > 1e12)
      throw new Error("단가를 확인해 주세요.");
    const gross = Math.round(line.quantity * line.unitPrice);
    const supply = line.priceIncludesTax && line.taxType === "taxable"
      ? Math.round(gross / 1.1) : gross;
    if (!Number.isSafeInteger(supply) || !Number.isSafeInteger(gross))
      throw new Error("금액이 너무 큽니다.");
    if (line.taxType === "taxable") {
      taxableSupply += supply;
      tax += line.priceIncludesTax ? gross - supply : Math.round(supply * 0.1);
    } else exemptSupply += supply;
  }
  const knownSubtotal = taxableSupply + exemptSupply + tax;
  const belowMinimum = knownSubtotal < policy.minimumAmount;
  const deliveryFee = belowMinimum && policy.minimumPolicy === "fee" ? policy.deliveryFee : 0;
  return {
    taxableSupply, exemptSupply, tax, knownSubtotal, deliveryFee,
    knownTotal: knownSubtotal + deliveryFee,
    marketCount,
    belowMinimum,
    canSubmit: !belowMinimum || policy.minimumPolicy !== "block" || marketCount > 0,
    totalIsEstimate: marketCount > 0,
  };
}
