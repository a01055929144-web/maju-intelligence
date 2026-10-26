export const DELIVERY_ISSUE_CAUSES = [
  "냉동 해동", "냉장 온도", "신선도/품질", "파손", "누락", "오배송",
  "수량 차이", "유통기한", "포장 불량", "고객 요청", "기타"
] as const;

export type DeliveryIssueCause = (typeof DELIVERY_ISSUE_CAUSES)[number];

export const DELIVERY_RECORD_TYPES = [
  { label: "완료", value: "arrived" },
  { label: "부분 배송", value: "partial" },
  { label: "반품", value: "return" },
  { label: "보충", value: "replenishment" },
  { label: "교환", value: "exchange" },
  { label: "파손", value: "damage" },
  { label: "누락", value: "missing" },
  { label: "기타", value: "other" }
] as const;

export type DeliveryRecordType = (typeof DELIVERY_RECORD_TYPES)[number]["value"];

export function requiresDeliveryIssueCause(type: DeliveryRecordType) {
  return type === "return" || type === "exchange" || type === "damage" || type === "missing";
}

export function requiresDeliveryItems(type: DeliveryRecordType) {
  return type !== "arrived";
}
