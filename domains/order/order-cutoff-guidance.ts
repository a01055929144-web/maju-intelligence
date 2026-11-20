import { canOrderForDelivery, type DeliveryPolicy } from "./order-rules";

/** Display guidance only; submission is still validated by the order RPC. */
export function orderCutoffGuidance(day: string, policy: DeliveryPolicy, now: Date) {
  try {
    const open = canOrderForDelivery(day, policy, now);
    const cutoff = new Date(`${day}T00:00:00.000Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - policy.cutoffDaysBefore);
    const cutoffDay = cutoff.toISOString().slice(0, 10);
    const deadline = Date.parse(`${cutoffDay}T${policy.cutoffTime}:00+09:00`);
    const minutes = Math.max(0, Math.ceil((deadline - now.getTime()) / 60000));
    const remaining = minutes >= 1440 ? `${Math.floor(minutes / 1440)}일 ${Math.floor(minutes % 1440 / 60)}시간`
      : minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
    return { open, label: `${cutoffDay} ${policy.cutoffTime} 마감 (한국시간)`,
      message: open ? `${remaining} 남음 · 담기만으로는 주문되지 않습니다.`
        : now.getTime() >= deadline ? "주문 마감이 지났습니다. 다른 배송일을 선택해 주세요."
          : "선택한 날은 배송이 불가능합니다. 다른 배송일을 선택해 주세요." };
  } catch {
    return { open: false, label: "주문 마감 확인 필요", message: "배송일과 배송 설정을 다시 확인해 주세요." };
  }
}
