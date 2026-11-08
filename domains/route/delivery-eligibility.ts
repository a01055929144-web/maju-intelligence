export type DeliveryEligibility = "eligible" | "not_ready";

export function isCustomerEligibleForTodayRoute(
  deliveryEligibility: DeliveryEligibility | undefined,
  deliveryEligibilityEnabled: boolean
) {
  return !deliveryEligibilityEnabled || deliveryEligibility === "eligible";
}
