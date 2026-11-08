export type StoreOrderScope = { companyId: string; customerId: string };
export type StoreOrderMember = StoreOrderScope & {
  storeAccountId: string; memberId: string; authUserId: string; status: string;
};
export type StoreOrderMemberResolver = (scope: StoreOrderScope) => Promise<StoreOrderMember | null>;

/** Scope comes from the verified link, never request JSON. */
export function storeOrderActor(scope: StoreOrderScope, member: StoreOrderMember | null) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!member || member.status !== "active" || member.companyId !== scope.companyId ||
    member.customerId !== scope.customerId || !uuid.test(member.storeAccountId) || !uuid.test(member.memberId) || !uuid.test(member.authUserId)) return null;
  return { storeAccountId: member.storeAccountId, memberId: member.memberId, authUserId: member.authUserId };
}
