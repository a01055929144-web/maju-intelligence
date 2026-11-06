import "server-only";

import { canAccessStoreCosts } from "../../domains/organization/store-cost-access";
import { isFeatureEnabled } from "../../lib/feature-flags";
import { getStoreMemberContext } from "../../lib/store/07-store-member-context";
import {
  listStoreCostHistory,
  listStoreCosts,
  updateStoreCost,
  type StoreCostRow
} from "../../lib/store/store-costs";

type Scope = { companyId: string; storeAccountId: string };
type AccessFailure = { ok: false; status: 401 | 403 | 404 };

async function authorize(scope: Scope, action: "read" | "manage") {
  if (!isFeatureEnabled("STORE_COSTS", scope.companyId)) return { ok: false, status: 404 } as const;
  const member = await getStoreMemberContext({ companyId: scope.companyId, storeAccountId: scope.storeAccountId });
  if (!member) return { ok: false, status: 401 } as const;
  if (!canAccessStoreCosts(member.role, action)) return { ok: false, status: 403 } as const;
  return { member, ok: true } as const;
}

export async function readStoreCosts(input: Scope & {
  from?: string;
  historyItemId?: string;
  offset?: number;
  product?: string;
  to?: string;
}): Promise<AccessFailure | { hasMore: boolean; ok: true; rows: Awaited<ReturnType<typeof listStoreCosts>>["rows"] }> {
  const access = await authorize(input, "read");
  if (!access.ok) return access;
  const page = input.historyItemId
    ? await listStoreCostHistory({ companyId: input.companyId, itemId: input.historyItemId, offset: input.offset,
      storeAccountId: input.storeAccountId })
    : await listStoreCosts({ companyId: input.companyId, from: input.from, product: input.product,
      offset: input.offset, storeAccountId: input.storeAccountId, to: input.to });
  return { ok: true, rows: page.rows, hasMore: page.hasMore };
}

export async function changeStoreCost(input: Scope & {
  expectedRevision: number;
  itemId: string;
  row: StoreCostRow;
}): Promise<AccessFailure | { ok: true; result: Awaited<ReturnType<typeof updateStoreCost>> }> {
  const access = await authorize(input, "manage");
  if (!access.ok) return access;
  const result = await updateStoreCost({ actorMemberId: access.member.memberId, companyId: input.companyId,
    expectedRevision: input.expectedRevision, itemId: input.itemId, row: input.row, storeAccountId: input.storeAccountId });
  return { ok: true, result };
}
