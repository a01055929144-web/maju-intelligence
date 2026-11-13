import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { assignCustomerByTerritory, supabaseRequest } from "../store";

type AddressSelection = { address: string; companyId: string; storeAccountId: string };

export function createStoreAddressSelection(input: AddressSelection) {
  const secret = process.env.STORE_OWNER_ONBOARDING_SECRET;
  if (!secret || secret.length < 32) return null;
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: Date.now() + 5 * 60_000, v: 1 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(`store-address-selection.v1.${payload}`).digest("base64url")}`;
}

export function verifyStoreAddressSelection(token: string, scope: { companyId: string; storeAccountId: string }) {
  const secret = process.env.STORE_OWNER_ONBOARDING_SECRET;
  const [payload, signature, extra] = token.split(".");
  if (!secret || secret.length < 32 || !payload || !signature || extra || token.length > 1200) return null;
  const expected = createHmac("sha256", secret).update(`store-address-selection.v1.${payload}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as AddressSelection & { expiresAt: number; v: number };
    return value.v === 1 && value.expiresAt >= Date.now() && value.expiresAt <= Date.now() + 5 * 60_000 &&
      value.companyId === scope.companyId && value.storeAccountId === scope.storeAccountId &&
      value.address.trim() === value.address && value.address.length > 0 && value.address.length <= 300 ? value.address : null;
  } catch { return null; }
}

export function isStoreAddressCompanyEnabled(companyId: string) {
  return process.env.STORE_MEMBER_ADDRESS_ENABLED === "true" &&
    (process.env.FEATURE_STORE_MEMBER_ADDRESS_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}

export async function getStoreAddress(input: { companyId: string; storeAccountId: string }) {
  const rows = await supabaseRequest<Array<{ normalized_customers: {
    address: string | null; delivery_address_detail: string | null; delivery_base_address: string | null;
  } | null }>>(`store_accounts?select=normalized_customers(address,delivery_base_address,delivery_address_detail)` +
    `&company_id=eq.${encodeURIComponent(input.companyId)}&id=eq.${encodeURIComponent(input.storeAccountId)}` +
    `&status=eq.active&business_status=in.(active,registration_pending)&limit=1`);
  const customer = rows[0]?.normalized_customers;
  return customer ? { address: customer.address, baseAddress: customer.delivery_base_address,
    addressDetail: customer.delivery_address_detail } : null;
}

export async function updateStoreAddress(input: { companyId: string; storeAccountId: string;
  baseAddress: string; addressDetail: string }) {
  const stores = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?select=customer_id&company_id=eq.${encodeURIComponent(input.companyId)}` +
    `&id=eq.${encodeURIComponent(input.storeAccountId)}&status=eq.active` +
    `&business_status=in.(active,registration_pending)&limit=1`);
  const customerId = stores[0]?.customer_id;
  if (!customerId) throw new Error("store_account_not_found");
  const recommendation = await assignCustomerByTerritory(input.companyId, input.baseAddress);
  const rows = await supabaseRequest<Array<{ id: string }>>(`normalized_customers?select=id&company_id=eq.${encodeURIComponent(input.companyId)}` +
    `&id=eq.${encodeURIComponent(customerId)}`, { method: "PATCH", body: JSON.stringify({
      address: `${input.baseAddress} ${input.addressDetail}`,
      delivery_address_detail: input.addressDetail,
      delivery_base_address: input.baseAddress,
      delivery_territory_id: recommendation.status === "matched" ? recommendation.territoryId : null,
    }), headers: { Prefer: "return=representation" } });
  if (rows.length !== 1 || rows[0].id !== customerId) throw new Error("store_address_not_updated");
  return rows[0];
}
