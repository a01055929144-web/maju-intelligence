export const DELIVERY_ISSUE_CAUSES = [
  "냉동 해동", "냉장 온도", "신선도/품질", "파손", "누락", "오배송",
  "수량 차이", "유통기한", "포장 불량", "고객 요청", "기타"
] as const;

export type DeliveryIssueCause = (typeof DELIVERY_ISSUE_CAUSES)[number];

export const DELIVERY_OCCURRENCE_STAGES = [
  { label: "입고", value: "receiving" },
  { label: "보관", value: "storage" },
  { label: "적재", value: "loading" },
  { label: "운송", value: "transit" },
  { label: "하차", value: "unloading" }
] as const;

export const DELIVERY_ACTIONS = [
  { label: "재배송", value: "redelivery" },
  { label: "교환", value: "exchange" },
  { label: "차감 금액", value: "deduction" },
  { label: "공급처 클레임", value: "supplier_claim" }
] as const;

export const DELIVERY_EVENT_STATUSES = [
  { label: "접수", value: "received" },
  { label: "조치 중", value: "in_progress" },
  { label: "완료", value: "completed" }
] as const;

export type DeliveryOccurrenceStage = (typeof DELIVERY_OCCURRENCE_STAGES)[number]["value"];
export type DeliveryAction = (typeof DELIVERY_ACTIONS)[number]["value"];
export type DeliveryEventStatus = (typeof DELIVERY_EVENT_STATUSES)[number]["value"];

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
