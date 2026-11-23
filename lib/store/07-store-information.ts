import "server-only";

import { createCustomerAttachmentSignedUrl, supabaseRequest, supabaseStorageRequest } from "../store";

export type StoreInformation = {
  businessRegistrationNumber: string;
  phone: string;
  representativeName: string;
  storeName: string;
};

export type StoreProfileInformation = StoreInformation & {
  storeProfileId: string;
  baseAddress: string;
  addressDetail: string;
  accessNote: string;
  deliveryContactPhone: string;
  preferredDeliveryTime: string;
  businessName?: string;
  subBusinessNumber?: string;
  businessEntityType?: string;
  taxInvoiceEmail?: string;
  receiveMethod?: "door" | "inside" | "dawn" | "";
  hasAccessPassword?: boolean;
};

export async function getStoreProfileInformation(companyId: string, storeAccountId: string, includeIdentity = false, includeDelivery = false): Promise<StoreProfileInformation | null> {
  const rows = await supabaseRequest<Array<{ business_registration_number: string; store_profile_id: string | null; store_profiles: {
    store_name: string; representative_name: string | null; base_address: string | null; address_detail: string | null;
    business_name?: string | null; sub_business_number?: string | null; business_entity_type?: string | null;
    access_note: string | null; delivery_contact_phone: string | null; preferred_delivery_time: string | null;
    tax_invoice_email?: string | null; receive_method?: "door" | "inside" | "dawn" | null; access_password_updated_at?: string | null;
  } | null }>>(`store_accounts?select=business_registration_number,store_profile_id,store_profiles(store_name,representative_name,base_address,address_detail,access_note,delivery_contact_phone,preferred_delivery_time${includeIdentity ? ",business_name,sub_business_number,business_entity_type" : ""}${includeDelivery ? ",tax_invoice_email,receive_method,access_password_updated_at" : ""})` +
    `&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(storeAccountId)}&status=eq.active&limit=1`);
  const account = rows[0], profile = account?.store_profiles;
  return account?.store_profile_id && profile ? { storeProfileId: account.store_profile_id, businessRegistrationNumber: account.business_registration_number,
    storeName: profile.store_name, representativeName: profile.representative_name || "", phone: profile.delivery_contact_phone || "",
    baseAddress: profile.base_address || "", addressDetail: profile.address_detail || "", accessNote: profile.access_note || "",
    deliveryContactPhone: profile.delivery_contact_phone || "", preferredDeliveryTime: profile.preferred_delivery_time || "",
    ...(includeIdentity ? { businessName: profile.business_name || "", subBusinessNumber: profile.sub_business_number || "",
      businessEntityType: profile.business_entity_type || "" } : {}),
    ...(includeDelivery ? { taxInvoiceEmail: profile.tax_invoice_email || "", receiveMethod: profile.receive_method || "",
      hasAccessPassword: Boolean(profile.access_password_updated_at) } : {}) } : null;
}

export async function updateStoreProfileInformation(storeProfileId: string, authUserId: string, changes: Omit<StoreProfileInformation, "businessRegistrationNumber" | "storeProfileId" | "phone">, requestKey: string) {
  return supabaseRequest<{ changedFields: string[]; alreadyApplied: boolean }>("rpc/update_store_profile_v1", { method: "POST", body: JSON.stringify({
    p_store_profile: storeProfileId, p_auth_user: authUserId, p_changes: changes, p_request_key: requestKey,
  }) });
}

export async function updateStoreProfileDeliveryInformation(storeProfileId: string, authUserId: string, changes: Record<string, string>, requestKey: string) {
  return supabaseRequest<{ changedFields: string[]; alreadyApplied: boolean }>("rpc/update_store_profile_delivery_v1", { method: "POST", body: JSON.stringify({
    p_store_profile: storeProfileId, p_auth_user: authUserId, p_changes: changes, p_request_key: requestKey,
  }) });
}

export type StoreProfileAttachmentKind = "cold" | "frozen" | "room";

export async function getStoreProfileAttachments(storeProfileId: string) {
  const rows = await supabaseRequest<Array<{ kind: StoreProfileAttachmentKind; storage_path: string; updated_at: string }>>(
    `store_profile_attachments?select=kind,storage_path,updated_at&store_profile_id=eq.${encodeURIComponent(storeProfileId)}&order=kind.asc`);
  return Promise.all(rows.map(async row => ({ kind: row.kind, updatedAt: row.updated_at,
    url: await createCustomerAttachmentSignedUrl(row.storage_path, 600) })));
}

export async function uploadStoreProfileAttachment(storeProfileId: string, kind: StoreProfileAttachmentKind, file: File) {
  const storagePath = `store-profiles/${storeProfileId}/${kind}`;
  await supabaseStorageRequest(`object/customer-attachments/${storagePath}`, { method: "POST",
    headers: { "Content-Type": file.type, "x-upsert": "true" }, body: await file.arrayBuffer() });
  const rows = await supabaseRequest<Array<{ kind: StoreProfileAttachmentKind; updated_at: string }>>(
    "store_profile_attachments?on_conflict=store_profile_id,kind", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ store_profile_id: storeProfileId, kind, storage_path: storagePath, updated_at: new Date().toISOString() }) });
  return rows[0];
}

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
