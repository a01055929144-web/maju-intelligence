import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseRequest } from "../store";
import { publicOwnerTestAccessAllowed } from "./public-owner-test-mode";

export const STORE_TERMS_VERSION = "2026-11-07";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicStoreOwnerOnboardingContext = {
  companyId: string; documentId: string; documentVersionId: string; shareLinkId: string; returnTo: string; nonce: string;
};

export function publicStoreOwnerOnboardingEnabled(companyId?: string) {
  if (!publicOwnerTestAccessAllowed(companyId)) return false;
  if (process.env.STORE_PUBLIC_OWNER_ONBOARDING_ENABLED !== "true") return false;
  const allowed = (process.env.FEATURE_STORE_PUBLIC_OWNER_ONBOARDING_COMPANY_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
  return Boolean(companyId && allowed.includes(companyId));
}

export function createPublicStoreOwnerOnboardingIntent(context: PublicStoreOwnerOnboardingContext) {
  const secret = process.env.STORE_OWNER_ONBOARDING_SECRET;
  if (!secret || secret.length < 32 || !publicStoreOwnerOnboardingEnabled(context.companyId) ||
    ![context.companyId, context.documentId, context.documentVersionId, context.shareLinkId, context.nonce].every(value => uuid.test(value)) ||
    !context.returnTo.startsWith("/pricing-document#") || context.returnTo.startsWith("//")) return null;
  const issuedAt = Date.now(), payload = Buffer.from(JSON.stringify({ ...context, expiresAt: issuedAt + 5 * 60_000, issuedAt, v: 1 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(`store-public-owner-onboarding.v1.${payload}`).digest("base64url")}`;
}

export function verifyPublicStoreOwnerOnboardingIntent(token: string): PublicStoreOwnerOnboardingContext | null {
  const secret = process.env.STORE_OWNER_ONBOARDING_SECRET;
  const [payload, signature, extra] = token.split(".");
  if (!secret || secret.length < 32 || !payload || !signature || extra || token.length > 1500) return null;
  const expected = createHmac("sha256", secret).update(`store-public-owner-onboarding.v1.${payload}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as PublicStoreOwnerOnboardingContext & { expiresAt: number; issuedAt: number; v: number };
    if (value.v !== 1 || value.issuedAt > Date.now() + 60_000 || value.expiresAt < Date.now() || value.expiresAt - value.issuedAt !== 5 * 60_000 ||
      !publicStoreOwnerOnboardingEnabled(value.companyId) ||
      ![value.companyId, value.documentId, value.documentVersionId, value.shareLinkId, value.nonce].every(item => uuid.test(item)) ||
      !value.returnTo.startsWith("/pricing-document#") || value.returnTo.startsWith("//")) return null;
    return { companyId: value.companyId, documentId: value.documentId, documentVersionId: value.documentVersionId,
      shareLinkId: value.shareLinkId, returnTo: value.returnTo, nonce: value.nonce };
  } catch { return null; }
}

export async function preparePublicStoreOwnerActivation(input: PublicStoreOwnerOnboardingContext & {
  idempotencyKey: string; token: string;
}) {
  return supabaseRequest<{ customerId: string; storeAccountId: string; expiresAt: string }>("rpc/prepare_public_store_owner_activation_v1", {
    method: "POST", body: JSON.stringify({ p_company_id: input.companyId, p_document_id: input.documentId,
      p_document_version_id: input.documentVersionId, p_idempotency_key: input.idempotencyKey,
      p_invite_token_hash: hashToken(input.token), p_share_link_id: input.shareLinkId })
  });
}

export async function completePublicStoreOwnerProfile(input: {
  address: string; addressDetail: string; baseAddress: string; businessRegistrationNumber: string; phone: string; representativeName: string; storeName: string; token: string;
}) {
  return supabaseRequest<{ companyId: string; storeAccountId: string }>("rpc/complete_public_store_owner_profile_v2", {
    method: "POST", body: JSON.stringify({ p_address: input.address, p_business_registration_number: input.businessRegistrationNumber,
      p_address_detail: input.addressDetail, p_base_address: input.baseAddress, p_invite_token_hash: hashToken(input.token),
      p_phone: input.phone, p_representative_name: input.representativeName,
      p_store_name: input.storeName })
  });
}

export function publicPreopeningStoreEnabled(companyId: string) {
  return process.env.STORE_PREOPENING_ENABLED === "true" &&
    (process.env.FEATURE_PREOPENING_COMPANY_IDS || "").split(",").map(value => value.trim()).includes(companyId);
}

export async function activatePreopeningStoreOwner(input: {
  authUserId: string; deliveryTerritoryId?: string; termsAcceptedAt: string; token: string;
}) {
  return supabaseRequest<{ companyId: string; storeAccountId: string }>("rpc/activate_preopening_store_owner_v1", {
    method: "POST", body: JSON.stringify({ p_auth_user_id: input.authUserId,
      p_delivery_territory_id: input.deliveryTerritoryId || null, p_invite_token_hash: hashToken(input.token),
      p_terms_accepted_at: input.termsAcceptedAt, p_terms_version: STORE_TERMS_VERSION })
  });
}

export type PreparedStoreOwnerActivation = {
  companyId: string;
  customerId: string | null;
  storeAccountId: string;
  businessRegistrationNumber: string;
  profileRequired: boolean;
  publicOnboarding: boolean;
};

export async function prepareStoreOwnerActivation(input: {
  companyId: string; customerId: string; actorCompanyMemberId: string; token: string;
}) {
  return supabaseRequest<{ customerId: string; storeAccountId: string; expiresAt: string }>("rpc/prepare_store_owner_activation_v1", {
    method: "POST",
    body: JSON.stringify({ p_actor_company_member_id: input.actorCompanyMemberId, p_company_id: input.companyId,
      p_customer_id: input.customerId, p_invite_token_hash: hashToken(input.token) })
  });
}

export async function getPreparedStoreOwnerActivation(token: string): Promise<PreparedStoreOwnerActivation | null> {
  const requests = await supabaseRequest<Array<{ company_id: string; customer_id: string | null; store_account_id: string; business_registration_number?: string | null;
    document_id?: string | null; document_version_id?: string | null; share_link_id?: string | null; store_name?: string | null }>>(
    `store_owner_activation_requests?select=company_id,customer_id,store_account_id,business_registration_number,document_id,document_version_id,share_link_id,store_name&invite_token_hash=eq.${hashToken(token)}&consumed_at=is.null&cancelled_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`
  );
  const request = requests[0];
  if (!request) return null;
  if (!request.customer_id) {
    if (!request.document_id || !request.document_version_id || !request.share_link_id) return null;
    const now = new Date().toISOString();
    const links = await supabaseRequest<Array<{ id: string }>>(`pricing_document_share_links?select=id&company_id=eq.${request.company_id}` +
      `&id=eq.${request.share_link_id}&document_id=eq.${request.document_id}&document_version_id=eq.${request.document_version_id}` +
      `&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}&limit=1`);
    const documents = links[0] ? await supabaseRequest<Array<{ id: string }>>(
      `pricing_documents?select=id&company_id=eq.${request.company_id}&id=eq.${request.document_id}&archived_at=is.null&limit=1`) : [];
    const versions = documents[0] ? await supabaseRequest<Array<{ content: { validUntil?: string } }>>(
      `pricing_document_versions?select=content&company_id=eq.${request.company_id}&document_id=eq.${request.document_id}&id=eq.${request.document_version_id}&limit=1`) : [];
    const validUntil = versions[0]?.content?.validUntil;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil || "") || Date.parse(`${validUntil}T23:59:59.999+09:00`) < Date.now()) return null;
  }
  const customers = request.customer_id ? await supabaseRequest<Array<{ business_registration_number: string | null }>>(
    `normalized_customers?select=business_registration_number&company_id=eq.${request.company_id}&id=eq.${request.customer_id}&limit=1`
  ) : [];
  const businessRegistrationNumber = (request.business_registration_number || customers[0]?.business_registration_number || "").replace(/\D/g, "");
  const profileRequired = !request.customer_id && !request.store_name;
  return profileRequired || businessRegistrationNumber.length === 10 || (!request.customer_id && publicPreopeningStoreEnabled(request.company_id)) ? { companyId: request.company_id, customerId: request.customer_id,
    storeAccountId: request.store_account_id, businessRegistrationNumber, profileRequired,
    publicOnboarding: !request.customer_id && Boolean(request.document_id) } : null;
}

export async function resolveOrCreateStoreKakaoUser(input: {
  avatarUrl?: string; email?: string; kakaoUserId: string; name?: string; phoneNumber?: string;
}) {
  const findExisting = () => supabaseRequest<Array<{ id: string; status: string }>>(
    `app_users?select=id,status&kakao_user_id=eq.${encodeURIComponent(input.kakaoUserId)}&limit=1`
  );
  const existing = await findExisting();
  if (existing[0]) return existing[0].status === "active" ? existing[0].id : null;
  const rows = await supabaseRequest<Array<{ id: string; status: string }>>("app_users?on_conflict=kakao_user_id", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([{ auth_provider: "kakao", avatar_url: input.avatarUrl || null,
      email: input.email || `kakao-${input.kakaoUserId}@maju.local`, kakao_user_id: input.kakaoUserId,
      last_login_at: new Date().toISOString(), name: input.name?.trim() || "매장 점주",
      phone: input.phoneNumber?.replace(/^\+82\s?/, "0").replace(/\D/g, "") || null,
      role: "customer_member", status: "active" }])
  });
  const resolved = rows[0] || (await findExisting())[0];
  return resolved?.status === "active" ? resolved.id : null;
}

export function getStorePublicBaseUrl() {
  const configured = process.env.STORE_PUBLIC_BASE_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function activateStoreOwner(input: {
  authUserId: string; businessRegistrationNumber: string; token: string; termsAcceptedAt: string;
  verificationRequestId: string; verifiedAt: string; deliveryTerritoryId?: string;
}) {
  return supabaseRequest<{ companyId: string; ownerMemberId: string; storeAccountId: string }>(input.deliveryTerritoryId
    ? "rpc/activate_public_store_owner_with_delivery_v1" : "rpc/activate_store_owner_v1", {
    method: "POST",
    body: JSON.stringify({ p_auth_user_id: input.authUserId, p_business_registration_number: input.businessRegistrationNumber,
      p_business_status: "active", p_invite_token_hash: hashToken(input.token), p_terms_accepted_at: input.termsAcceptedAt,
      p_terms_version: STORE_TERMS_VERSION, p_verification_request_id: input.verificationRequestId, p_verified_at: input.verifiedAt,
      ...(input.deliveryTerritoryId ? { p_delivery_territory_id: input.deliveryTerritoryId } : {}) })
  });
}
