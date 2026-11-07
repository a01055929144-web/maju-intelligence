import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { activateStoreOwner, getPreparedStoreOwnerActivation, getStorePublicBaseUrl, prepareStoreOwnerActivation,
  resolveOrCreateStoreKakaoUser } from "../lib/store/07-store-owner-provisioning";

beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("store owner activation repository", () => {
  it("does not overwrite an existing Kakao user when concurrent creation wins", async () => {
    mocks.db.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "existing", status: "active" }]);
    await expect(resolveOrCreateStoreKakaoUser({ kakaoUserId: "kakao-1", name: "new name" })).resolves.toBe("existing");
    expect(mocks.db.mock.calls[1][1].headers.Prefer).toBe("resolution=ignore-duplicates,return=representation");
    expect(mocks.db).toHaveBeenCalledTimes(3);
  });

  it("does not reactivate an inactive Kakao user found after a concurrent insert", async () => {
    mocks.db.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "existing", status: "inactive" }]);
    await expect(resolveOrCreateStoreKakaoUser({ kakaoUserId: "kakao-1" })).resolves.toBeNull();
  });

  it("accepts only a configured HTTPS origin for public activation links", () => {
    expect(getStorePublicBaseUrl()).toBeNull();
    vi.stubEnv("STORE_PUBLIC_BASE_URL", "http://store.example.test");
    expect(getStorePublicBaseUrl()).toBeNull();
    vi.stubEnv("STORE_PUBLIC_BASE_URL", "https://store.example.test/path");
    expect(getStorePublicBaseUrl()).toBeNull();
    vi.stubEnv("STORE_PUBLIC_BASE_URL", "https://store.example.test/");
    expect(getStorePublicBaseUrl()).toBe("https://store.example.test");
  });
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
