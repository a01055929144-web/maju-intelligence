import "server-only";

import { supabaseRequest } from "../store";

export type StoreInformation = {
  businessRegistrationNumber: string;
  phone: string;
  representativeName: string;
  storeName: string;
};

export async function getStoreInformation(companyId: string, storeAccountId: string) {
  const rows = await supabaseRequest<Array<{ business_registration_number: string; customer_id: string; normalized_customers: {
    customer_name: string; phone: string | null; representative_name: string | null;
  } | null }>>(`store_accounts?select=business_registration_number,customer_id,normalized_customers(customer_name,representative_name,phone)` +
    `&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(storeAccountId)}` +
    `&status=eq.active&business_status=in.(active,registration_pending)&limit=1`);
  const store = rows[0], customer = store?.normalized_customers;
  return store && customer ? { businessRegistrationNumber: store.business_registration_number,
    phone: customer.phone || "", representativeName: customer.representative_name || "", storeName: customer.customer_name } : null;
}

export async function updateStoreInformation(companyId: string, storeAccountId: string, input: Omit<StoreInformation, "businessRegistrationNumber">) {
  const stores = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?select=customer_id&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(storeAccountId)}` +
    `&status=eq.active&business_status=in.(active,registration_pending)&limit=1`);
  const customerId = stores[0]?.customer_id;
  if (!customerId) throw new Error("store_account_not_found");
  const rows = await supabaseRequest<Array<{ id: string }>>(`normalized_customers?select=id&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(customerId)}`,
    { method: "PATCH", body: JSON.stringify({ customer_name: input.storeName, representative_name: input.representativeName || null, phone: input.phone || null }), headers: { Prefer: "return=representation" } });
  if (rows.length !== 1) throw new Error("store_information_not_updated");
}
