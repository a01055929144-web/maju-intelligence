import { supabaseRequest } from "@/lib/store";

export type PendingStoreCustomerReview = {
  storeAccountId: string;
  customerId: string;
  name: string;
  address: string | null;
  businessNumber: string | null;
  createdAt: string;
};

export const listPendingStoreCustomerReviews = (companyId: string) =>
  supabaseRequest<PendingStoreCustomerReview[]>("rpc/list_pending_store_customer_reviews_v1", {
    method: "POST",
    body: JSON.stringify({ p_company: companyId })
  });
