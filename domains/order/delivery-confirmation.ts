export const DELIVERY_CONFIRMATION_NOTICE = "주문 접수 후 배송일 확인";

/** A date is never promised until company settings and customer/territory weekdays exist. */
export function needsDeliveryConfirmation(companySettingsExist: boolean, weekdays: readonly number[]) {
  return !companySettingsExist || weekdays.length === 0;
}
