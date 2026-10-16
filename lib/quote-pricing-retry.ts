export function isQuotePricingPending(input: {
  customerId?: string;
  pricingAppliedAt?: string;
  status: string;
}) {
  return input.status === "accepted" && Boolean(input.customerId) && !input.pricingAppliedAt;
}
