import { dateField, isId } from "../pricing/document";
import { kstDateTime } from "./order-rules";

export function parseDeliveryConfirmation(input: Record<string, unknown>, now = new Date()) {
  if (!isId(input.orderId) || !isId(input.requestId) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision)<1)
    throw new Error("주문을 다시 조회한 뒤 확정해 주세요.");
  if(input.action!=="confirm"&&input.action!=="cancel")throw new Error("처리 방법을 확인해 주세요.");
  const action=input.action;
  const deliveryDate=action==="confirm"?dateField(input.deliveryDate):null;
  const today=kstDateTime(now).date;
  if (deliveryDate && (deliveryDate<today || Date.parse(deliveryDate)-Date.parse(today)>366*86400000)) throw new Error("오늘부터 1년 이내의 배송일을 선택해 주세요.");
  return {orderId:input.orderId,requestId:input.requestId,expectedRevision:Number(input.expectedRevision),deliveryDate,action};
}
