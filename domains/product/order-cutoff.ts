/** Both product cutoff fields are inherited together when empty. */
export function productOrderCutoff(days: number | null, time: string | null) {
  if (days === null && time === null) return { order_cutoff_days_before: null, order_cutoff_time: null };
  if (!Number.isInteger(days) || days! < 0 || days! > 365 || !time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("주문 마감은 며칠 전(0~365)과 시각을 함께 입력해 주세요.");
  }
  return { order_cutoff_days_before: days, order_cutoff_time: time };
}

