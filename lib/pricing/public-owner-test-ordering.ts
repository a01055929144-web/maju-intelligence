import "server-only";
import { supabaseRequest } from "../store";
import { publicOwnerTestAccessAllowed, publicOwnerTestModeRequested } from "../store/public-owner-test-mode";

export async function preparePublicOwnerTestOrdering(companyId: string, storeAccountId: string) {
  if (!publicOwnerTestModeRequested() || !publicOwnerTestAccessAllowed(companyId)) throw new Error("Test ordering unavailable");
  const rows = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?select=customer_id&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(storeAccountId)}` +
    "&status=eq.active&verification_request_id=like.test-only:*&limit=1");
  if (!rows[0]?.customer_id) throw new Error("Test ordering unavailable");
  await supabaseRequest("store_order_customer_rules?on_conflict=company_id,customer_id", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, customer_id: rows[0].customer_id, delivery_weekdays: [0, 1, 2, 3, 4, 5, 6] }),
  });
}
