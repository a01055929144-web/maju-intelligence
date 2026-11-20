import "server-only";

import { isFeatureEnabled } from "../feature-flags";
import { supabaseRequest } from "../store";
import { getStoreMemberContext } from "./07-store-member-context";

export type StoreSettlementAccount = { bank: string; number: string; holder: string };

/** Account details are returned only after the signed member session resolves the exact company/store pair. */
export async function getStoreSettlementAccount(
  scope: { companyId: string; storeAccountId: string },
  verifiedMember?: Awaited<ReturnType<typeof getStoreMemberContext>>,
): Promise<StoreSettlementAccount | null> {
  if (!isFeatureEnabled("STORE_SETTLEMENT_ACCOUNT", scope.companyId)) return null;
  const member = verifiedMember ?? await getStoreMemberContext(scope);
  if (!member || member.companyId !== scope.companyId || member.storeAccountId !== scope.storeAccountId) return null;
  const rows = await supabaseRequest<Array<{ settlement_bank: string | null; settlement_account_number: string | null; settlement_account_holder: string | null }>>(
    `company_profiles?select=settlement_bank,settlement_account_number,settlement_account_holder&company_id=eq.${encodeURIComponent(member.companyId)}` +
    "&show_settlement_account_to_stores=is.true&limit=1",
  );
  const row = rows[0], number = row?.settlement_account_number?.trim();
  if (!number) return null;
  return { bank: row.settlement_bank?.trim() || "", number, holder: row.settlement_account_holder?.trim() || "" };
}
