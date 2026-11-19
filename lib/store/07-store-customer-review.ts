import "server-only";

import { supabaseRequest } from "../store";

type AccountRow = {
  id: string;
  customer_id: string;
  store_profile_id: string | null;
  business_status: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  store_name: string;
  business_registration_number: string | null;
  business_status: string;
  base_address: string | null;
  address_detail: string | null;
};

type CustomerRow = { id: string; customer_name: string };

export type StoreCustomerReviewItem = {
  storeAccountId: string;
  customerId: string;
  storeName: string;
  customerName: string;
  businessRegistrationNumber: string | null;
  businessStatus: string;
  address: string | null;
  createdAt: string;
};

export async function listStoreCustomerReviews(companyId: string): Promise<StoreCustomerReviewItem[]> {
  const company = encodeURIComponent(companyId);
  const accounts = await supabaseRequest<AccountRow[]>(
    `store_accounts?select=id,customer_id,store_profile_id,business_status,created_at&company_id=eq.${company}` +
      "&status=eq.active&customer_review_status=eq.needs_review&order=created_at.desc&limit=100",
  );
  if (!accounts.length) return [];

  const profileIds = accounts.map((row) => row.store_profile_id).filter((id): id is string => Boolean(id));
  const customerIds = accounts.map((row) => row.customer_id);
  const [profiles, customers] = await Promise.all([
    profileIds.length
      ? supabaseRequest<ProfileRow[]>(
          `store_profiles?select=id,store_name,business_registration_number,business_status,base_address,address_detail` +
            `&id=in.(${profileIds.join(",")})&limit=100`,
        )
      : Promise.resolve([]),
    supabaseRequest<CustomerRow[]>(
      `normalized_customers?select=id,customer_name&company_id=eq.${company}&id=in.(${customerIds.join(",")})&limit=100`,
    ),
  ]);
  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const customerById = new Map(customers.map((row) => [row.id, row]));

  return accounts.map((account) => {
    const profile = account.store_profile_id ? profileById.get(account.store_profile_id) : undefined;
    const customer = customerById.get(account.customer_id);
    const address = [profile?.base_address?.trim(), profile?.address_detail?.trim()].filter(Boolean).join(" ") || null;
    return {
      storeAccountId: account.id,
      customerId: account.customer_id,
      storeName: profile?.store_name?.trim() || customer?.customer_name?.trim() || "이름 없는 매장",
      customerName: customer?.customer_name?.trim() || "이름 없는 매출처",
      businessRegistrationNumber: profile?.business_registration_number || null,
      businessStatus: profile?.business_status || account.business_status,
      address,
      createdAt: account.created_at,
    };
  });
}
