import "server-only";

import { assignCustomerByTerritory, supabaseRequest } from "../store";

export function isStoreAddressCompanyEnabled(companyId: string) {
  return process.env.STORE_MEMBER_ADDRESS_ENABLED === "true" &&
    (process.env.FEATURE_STORE_MEMBER_ADDRESS_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}

export async function getStoreAddress(input: { companyId: string; storeAccountId: string }) {
  const rows = await supabaseRequest<Array<{ normalized_customers: {
    address: string | null; delivery_address_detail: string | null; delivery_base_address: string | null;
  } | null }>>(`store_accounts?select=normalized_customers(address,delivery_base_address,delivery_address_detail)` +
    `&company_id=eq.${encodeURIComponent(input.companyId)}&id=eq.${encodeURIComponent(input.storeAccountId)}` +
    `&status=eq.active&business_status=in.(active,registration_pending)&limit=1`);
  const customer = rows[0]?.normalized_customers;
  return customer ? { address: customer.address, baseAddress: customer.delivery_base_address,
    addressDetail: customer.delivery_address_detail } : null;
}

export async function updateStoreAddress(input: { companyId: string; storeAccountId: string;
  baseAddress: string; addressDetail: string }) {
  const stores = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?select=customer_id&company_id=eq.${encodeURIComponent(input.companyId)}` +
    `&id=eq.${encodeURIComponent(input.storeAccountId)}&status=eq.active` +
    `&business_status=in.(active,registration_pending)&limit=1`);
  const customerId = stores[0]?.customer_id;
  if (!customerId) throw new Error("store_account_not_found");
  const recommendation = await assignCustomerByTerritory(input.companyId, input.baseAddress);
  return supabaseRequest(`normalized_customers?company_id=eq.${encodeURIComponent(input.companyId)}` +
    `&id=eq.${encodeURIComponent(customerId)}`, { method: "PATCH", body: JSON.stringify({
      address: `${input.baseAddress} ${input.addressDetail}`,
      delivery_address_detail: input.addressDetail,
      delivery_base_address: input.baseAddress,
      delivery_territory_id: recommendation.status === "matched" ? recommendation.territoryId : null,
    }) });
}
