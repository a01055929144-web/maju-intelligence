const ids = () => (process.env.ORDER_FULFILLMENT_COMPANY_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);

export function orderFulfillmentEnabled(companyId?: string | null) {
  return process.env.ORDER_FULFILLMENT === "true" && Boolean(companyId && ids().includes(companyId));
}
