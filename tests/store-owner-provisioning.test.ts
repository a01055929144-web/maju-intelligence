import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { activateStoreOwner, getPreparedStoreOwnerActivation, prepareStoreOwnerActivation } from "../lib/store/07-store-owner-provisioning";

beforeEach(() => vi.clearAllMocks());

describe("store owner activation repository", () => {
  it("stores only a hash of the representative-issued token", async () => {
    mocks.db.mockResolvedValue({ customerId: "c", storeAccountId: "s", expiresAt: "x" });
    await prepareStoreOwnerActivation({ companyId: "company", customerId: "customer", actorCompanyMemberId: "actor", token: "secret" });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(body.p_invite_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("loads only an unconsumed unexpired company/customer scope", async () => {
    mocks.db.mockResolvedValueOnce([{ company_id: "company", customer_id: "customer", store_account_id: "store" }])
      .mockResolvedValueOnce([{ business_registration_number: "123-45-67890" }]);
    await expect(getPreparedStoreOwnerActivation("a".repeat(43))).resolves.toEqual({
      companyId: "company", customerId: "customer", storeAccountId: "store", businessRegistrationNumber: "1234567890"
    });
    expect(mocks.db.mock.calls[0][0]).toContain("consumed_at=is.null&cancelled_at=is.null&expires_at=gt.");
  });

  it("binds activation to the hashed token, verified business and server terms version", async () => {
    mocks.db.mockResolvedValue({ companyId: "company", storeAccountId: "store", ownerMemberId: "owner" });
    await activateStoreOwner({ authUserId: "user", businessRegistrationNumber: "1234567890", token: "a".repeat(43),
      termsAcceptedAt: "2026-11-07T00:00:00.000Z", verificationRequestId: "request-identifier-123", verifiedAt: "2026-11-07T00:01:00.000Z" });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(body).toMatchObject({ p_auth_user_id: "user", p_business_registration_number: "1234567890",
      p_business_status: "active", p_terms_version: "2026-11-07" });
    expect(body.p_invite_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
