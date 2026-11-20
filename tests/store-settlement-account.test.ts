import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), feature: vi.fn(), member: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.member }));

import { getStoreSettlementAccount } from "@/lib/store/07-store-settlement-account";

const scope = { companyId: "00000000-0000-4000-8000-000000000001", storeAccountId: "20000000-0000-4000-8000-000000000001" };
describe("store settlement account boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.feature.mockReturnValue(true); });
  it("does not read account data while the rollout is off or the member session is absent", async () => {
    mocks.feature.mockReturnValue(false);
    await expect(getStoreSettlementAccount(scope)).resolves.toBeNull();
    expect(mocks.member).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
    mocks.feature.mockReturnValue(true); mocks.member.mockResolvedValue(null);
    await expect(getStoreSettlementAccount(scope)).resolves.toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("returns only an explicitly enabled account to the verified store scope", async () => {
    mocks.member.mockResolvedValue({ ...scope, memberId: "member", role: "staff" });
    mocks.db.mockResolvedValue([{ settlement_bank: " 합성은행 ", settlement_account_number: " 123-456 ", settlement_account_holder: " 예금주 " }]);
    await expect(getStoreSettlementAccount(scope)).resolves.toEqual({ bank: "합성은행", number: "123-456", holder: "예금주" });
    expect(mocks.db.mock.calls[0][0]).toContain(`company_id=eq.${scope.companyId}&show_settlement_account_to_stores=is.true`);
  });
  it("hides the card when the account number is missing", async () => {
    mocks.member.mockResolvedValue({ ...scope, memberId: "member", role: "owner" });
    mocks.db.mockResolvedValue([{ settlement_bank: "합성은행", settlement_account_number: null, settlement_account_holder: "예금주" }]);
    await expect(getStoreSettlementAccount(scope)).resolves.toBeNull();
  });
});
