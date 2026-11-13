// CC-34-2: 행사 담기 서랍의 순수 계산. 행사가↔할인%는 서로 계산되고, 서버에는 매입가+마진(소수 2자리)으로 저장한다.
export type BasketBadge = "행사" | "임박";

/** 정상가에서 할인 %만큼 뺀 행사가(원 단위 반올림). */
export const priceFromDiscount = (regular: number, percent: number) => Math.max(0, Math.round(regular * (1 - percent / 100)));
/** 정상가 대비 할인 %(소수 1자리). 정상가가 0이면 null. */
export const discountFromPrice = (regular: number, price: number) => (regular > 0 ? Math.round(((regular - price) / regular) * 1000) / 10 : null);
/** 행사가를 만드는 마진 %(매입가 기준 가산율, 소수 2자리). 매입가가 없으면 null. */
export const marginFromPrice = (cost: number, price: number) => (cost > 0 && price > 0 ? Math.round((price / cost - 1) * 10000) / 100 : null);

const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 빠른 기간 칩: 이번 주(오늘~일요일) · 다음 주(월~일) · 이번 달(오늘~말일). */
export function quickRange(today: string, which: "thisWeek" | "nextWeek" | "thisMonth") {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=일
  const sunday = addDays(today, (7 - dow) % 7);
  if (which === "thisWeek") return { startsOn: today, endsOn: sunday };
  if (which === "nextWeek") return { startsOn: addDays(sunday, 1), endsOn: addDays(sunday, 7) };
  const [y, m] = today.split("-").map(Number);
  return { startsOn: today, endsOn: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

export type BasketLine = { productId: string; cost: number; price: number; regular: number };
/** 담은 줄 하나의 입력 오류(없으면 null). */
export function basketLineError(line: BasketLine): string | null {
  if (!(line.cost > 0)) return "매입가가 없어 행사가를 계산할 수 없습니다.";
  if (!(line.price > 0)) return "행사가를 입력해 주세요.";
  const margin = marginFromPrice(line.cost, line.price);
  if (margin === null || margin > 1000) return "행사가가 매입가의 11배를 넘습니다.";
  return null;
}
