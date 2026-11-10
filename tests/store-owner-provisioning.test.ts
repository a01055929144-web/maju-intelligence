import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { activatePreopeningStoreOwner, activateStoreOwner, completePublicStoreOwnerProfile, createPublicStoreOwnerOnboardingIntent, getPreparedStoreOwnerActivation, getStorePublicBaseUrl,
  publicOwnerBaseAddressEnabled, publicPreopeningStoreEnabled,
  preparePublicStoreOwnerActivation, prepareStoreOwnerActivation, resolveOrCreateStoreKakaoUser,
  verifyPublicStoreOwnerOnboardingIntent } from "../lib/store/07-store-owner-provisioning";

beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("store owner activation repository", () => {
  it("keeps public document onboarding signed, short-lived and default-off", () => {
    const context = { companyId: "00000000-0000-4000-8000-000000000001", documentId: "10000000-0000-4000-8000-000000000001",
      documentVersionId: "20000000-0000-4000-8000-000000000001", shareLinkId: "30000000-0000-4000-8000-000000000001",
      nonce: "40000000-0000-4000-8000-000000000001", returnTo: "/pricing-document#opaque" };
    vi.stubEnv("STORE_OWNER_ONBOARDING_SECRET", "s".repeat(32));
    expect(createPublicStoreOwnerOnboardingIntent(context)).toBeNull();
    vi.stubEnv("STORE_PUBLIC_OWNER_ONBOARDING_ENABLED", "true");
    vi.stubEnv("FEATURE_STORE_PUBLIC_OWNER_ONBOARDING_COMPANY_IDS", context.companyId);
    const token = createPublicStoreOwnerOnboardingIntent(context)!;
    expect(verifyPublicStoreOwnerOnboardingIntent(token)).toEqual(context);
    expect(verifyPublicStoreOwnerOnboardingIntent(`${token}x`)).toBeNull();
  });

  it("prepares a public owner without trusting customer or store identifiers", async () => {
    mocks.db.mockResolvedValue({ customerId: null, storeAccountId: "generated", expiresAt: "x" });
    await preparePublicStoreOwnerActivation({ companyId: "company", documentId: "document", documentVersionId: "version", shareLinkId: "share",
      nonce: "nonce", returnTo: "/pricing-document#opaque", idempotencyKey: "retry", token: "secret" });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("p_customer_id"); expect(body).not.toHaveProperty("p_store_account_id");
    expect(body.p_invite_token_hash).toMatch(/^[0-9a-f]{64}$/); expect(JSON.stringify(body)).not.toContain("secret");
    expect(body).not.toHaveProperty("p_store_name");
  });

  it("keeps the existing profile RPC while separated address storage is OFF", async () => {
    mocks.db.mockResolvedValue({ companyId: "company", storeAccountId: "store" });
    await completePublicStoreOwnerProfile({ address: "Seoul suite 1", baseAddress: "Seoul", addressDetail: "suite 1",
      businessRegistrationNumber: "1234567890", companyId: "company", phone: "01012345678",
      representativeName: "Owner", storeName: "Store", token: "secret" });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(mocks.db.mock.calls[0][0]).toBe("rpc/complete_public_store_owner_profile_v1");
    expect(body).toMatchObject({ p_store_name: "Store", p_business_registration_number: "1234567890" });
    expect(body).not.toHaveProperty("p_base_address"); expect(body).not.toHaveProperty("p_address_detail");
  });

  it("uses v2 only for an explicitly approved company", async () => {
    vi.stubEnv("STORE_PUBLIC_OWNER_BASE_ADDRESS_ENABLED", "true");
    vi.stubEnv("FEATURE_STORE_PUBLIC_OWNER_BASE_ADDRESS_COMPANY_IDS", "other,company");
    mocks.db.mockResolvedValue({ companyId: "company", storeAccountId: "store" });
    await completePublicStoreOwnerProfile({ address: "Seoul suite 1", baseAddress: "Seoul", addressDetail: "suite 1",
      businessRegistrationNumber: "1234567890", companyId: "company", phone: "01012345678",
      representativeName: "Owner", storeName: "Store", token: "secret" });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(mocks.db.mock.calls[0][0]).toBe("rpc/complete_public_store_owner_profile_v2");
    expect(body).toMatchObject({ p_base_address: "Seoul", p_address_detail: "suite 1" });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(publicOwnerBaseAddressEnabled("company")).toBe(true);
    expect(publicOwnerBaseAddressEnabled("unknown")).toBe(false);
  });

  it("keeps no-number signup scoped to a configured company and sends no invented registration number", async () => {
    expect(publicPreopeningStoreEnabled("company")).toBe(false);
    vi.stubEnv("STORE_PREOPENING_ENABLED", "true");
    vi.stubEnv("FEATURE_PREOPENING_COMPANY_IDS", "other,company");
    expect(publicPreopeningStoreEnabled("company")).toBe(true);
    expect(publicPreopeningStoreEnabled("unknown")).toBe(false);
    mocks.db.mockResolvedValue({ companyId: "company", storeAccountId: "store" });
    await activatePreopeningStoreOwner({ authUserId: "user", token: "a".repeat(43), termsAcceptedAt: "2026-11-10T00:00:00.000Z" });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("p_business_registration_number");
    expect(body.p_delivery_territory_id).toBeNull();
    expect(body.p_invite_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

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
      companyId: "company", customerId: "customer", storeAccountId: "store", businessRegistrationNumber: "1234567890",
      profileRequired: false, publicOnboarding: false
    });
    expect(mocks.db.mock.calls[0][0]).toContain("consumed_at=is.null&cancelled_at=is.null&expires_at=gt.");
  });

  it("revalidates the public document link and price period before OAuth completion", async () => {
    mocks.db.mockResolvedValueOnce([{ company_id: "company", customer_id: null, store_account_id: "store",
      business_registration_number: "1234567890", document_id: "document", document_version_id: "version", share_link_id: "share" }])
      .mockResolvedValueOnce([{ id: "share" }]).mockResolvedValueOnce([{ id: "document" }])
      .mockResolvedValueOnce([{ content: { validUntil: "2099-12-31" } }]);
    await expect(getPreparedStoreOwnerActivation("a".repeat(43))).resolves.toMatchObject({ companyId: "company", customerId: null,
      storeAccountId: "store", businessRegistrationNumber: "1234567890" });
    expect(mocks.db.mock.calls[1][0]).toContain("revoked_at=is.null&expires_at=gt.");
    expect(mocks.db.mock.calls[2][0]).toContain("archived_at=is.null");
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
