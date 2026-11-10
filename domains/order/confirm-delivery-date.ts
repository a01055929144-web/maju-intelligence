import { dateField, isId } from "../pricing/document";

export function parseDeliveryConfirmation(input: Record<string, unknown>) {
  if (!isId(input.orderId) || !isId(input.requestId) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision)<1)
    throw new Error("주문을 다시 조회한 뒤 확정해 주세요.");
  if(input.action!=="confirm"&&input.action!=="cancel")throw new Error("처리 방법을 확인해 주세요.");
  const action=input.action;
  const deliveryDate=action==="confirm"?dateField(input.deliveryDate):null;
  // Relative date policy is checked by the RPC after receipt lookup, so a response-loss
  // retry remains valid even when the original chosen day has since passed.
  return {orderId:input.orderId,requestId:input.requestId,expectedRevision:Number(input.expectedRevision),deliveryDate,action};
}
