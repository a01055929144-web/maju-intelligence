import type { DocumentInfoItem } from "./document";
export const ORDER_FOOTER_KEYS = ["next_day_cutoff_time", "delivery_weekdays"] as const;
export function orderFooterNotice(value: string): DocumentInfoItem[] {
  return ORDER_FOOTER_KEYS.map((key, index) => ({ key, label: index ? "배송 요일" : "주문 마감", place: "footer", value }));
}
/** Display overlay only: preserve selected fields/order and every stored version. */
export function withOrderFooter(info: DocumentInfoItem[], current?: DocumentInfoItem[]): DocumentInfoItem[] {
  return current ? info.map(item => {
    const replacement = current.find(row => row.key === item.key && (ORDER_FOOTER_KEYS as readonly string[]).includes(row.key));
    return replacement ? { ...item, value: replacement.value } : item;
  }) : info;
}
