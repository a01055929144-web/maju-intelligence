import "server-only";

import { isIP } from "net";
import type { NextRequest } from "next/server";
import type { SharedPricingAcceptanceInput, VerifiedSharedPricingAcceptance } from "../../application/pricing/accept-shared-pricing-document";
import { isId } from "../../domains/pricing/document";
import { getRequestAuthScope, getStoreSession, scopeHasCapability } from "../auth";
import { supabaseRequest } from "../store";
import { getStoreOrderMemberContext } from "../store/07-store-member-context";
import { equalShareHash, shareRequesterHash, verifyDocumentShareToken } from "./document-share-token";
import { quoteAcceptanceEnabled } from "./acceptance-feature";

type Share = {
  company_id: string;
  document_id: string;
  document_version_id: string;
  expires_at: string;
  id: string;
  lead_id: string;
  revoked_at: string | null;
  send_id: string | null;
  token_hash: string;
  token_nonce: string;
};

export class SharedAcceptanceError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 | 429 | 503) { super(message); }
}

const missing = (): never => { throw new SharedAcceptanceError("수락할 공유 문서를 찾을 수 없습니다.", 404); };
const profile = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const [key, limit] of Object.entries({ businessName: 120, phone: 30, address: 300, businessRegistrationNumber: 20 })) {
    if (typeof input[key] === "string" && input[key].trim()) output[key] = input[key].trim().slice(0, limit);
  }
  return output;
};

export function parseSharedAcceptanceInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new SharedAcceptanceError("수락 요청을 확인해 주세요.", 400);
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["shareToken", "idempotencyKey", "customerProfile"].includes(key)))
    throw new SharedAcceptanceError("수락 요청을 확인해 주세요.", 400);
  if (typeof value.shareToken !== "string" || value.shareToken.length > 300 || !isId(String(value.idempotencyKey || "")))
    throw new SharedAcceptanceError("공유 링크와 재시도 키를 확인해 주세요.", 400);
  return {
    customerProfile: profile(value.customerProfile),
    idempotencyKey: String(value.idempotencyKey).toLowerCase(),
    shareToken: value.shareToken,
  };
}

async function actor(request: NextRequest, companyId: string, customerId?: string) {
  const staff = await getRequestAuthScope(request, companyId);
  if (staff.ok) {
    if (staff.companyId !== companyId || !scopeHasCapability(staff, "manage_sales")) return missing();
    const identity = staff.customerSession?.userId || staff.customerSession?.companyMemberId || staff.adminSession?.email;
    if (!identity) return missing();
    return { acceptedVia: "staff" as const, actorKey: `staff:${identity}`,
      ...(isId(staff.customerSession?.userId || "") ? { actorUserId: staff.customerSession!.userId } : {}) };
  }
  const session = await getStoreSession();
  if (!session) return { acceptedVia: "store" as const };
  if (!customerId) return missing();
  const member = await getStoreOrderMemberContext({ companyId, customerId });
  if (!member || member.authUserId !== session.authUserId) return missing();
  return { acceptedVia: "kakao_login" as const, actorKey: `store-member:${member.memberId}`, actorUserId: member.authUserId };
}

export async function verifySharedPricingAcceptance(
  request: NextRequest,
  token: string,
  input: SharedPricingAcceptanceInput,
): Promise<VerifiedSharedPricingAcceptance> {
  if (!quoteAcceptanceEnabled()) return missing();
  const decoded = verifyDocumentShareToken(token);
  if (!decoded) return missing();
  const shares = await supabaseRequest<Share[]>(
    `pricing_document_share_links?id=eq.${encodeURIComponent(decoded.id)}&token_hash=eq.${decoded.hash}&select=id,company_id,document_id,document_version_id,lead_id,send_id,token_nonce,token_hash,expires_at,revoked_at&limit=1`,
  );
  const share = shares[0];
  if (!share || !quoteAcceptanceEnabled(share.company_id) || share.revoked_at || !share.send_id ||
    share.token_nonce !== decoded.nonce || !equalShareHash(share.token_hash, decoded.hash) ||
    !Number.isFinite(Date.parse(share.expires_at)) || Date.parse(share.expires_at) <= Date.now()) return missing();
  const sendId = share.send_id;

  const sends = await supabaseRequest<Array<{ id: string }>>(
    `pricing_document_sends?id=eq.${sendId}&company_id=eq.${share.company_id}&document_id=eq.${share.document_id}&document_version_id=eq.${share.document_version_id}&lead_id=eq.${share.lead_id}&acceptance_status=in.(sent,viewed,accepted)&select=id&limit=1`,
  );
  const versions = await supabaseRequest<Array<{ id: string }>>(
    `pricing_document_versions?id=eq.${share.document_version_id}&company_id=eq.${share.company_id}&document_id=eq.${share.document_id}&published_at=not.is.null&select=id&limit=1`,
  );
  const documents = await supabaseRequest<Array<{ id: string }>>(
    `pricing_documents?id=eq.${share.document_id}&company_id=eq.${share.company_id}&archived_at=is.null&kind=in.(sheet,quote)&select=id&limit=1`,
  );
  const leads = await supabaseRequest<Array<{ matched_customer_id: string | null }>>(
    `business_permit_leads?id=eq.${share.lead_id}&company_id=eq.${share.company_id}&merged_into_lead_id=is.null&select=matched_customer_id&limit=1`,
  );
  if (!sends[0] || !versions[0] || !documents[0] || !leads[0]) return missing();
  const customerId = leads[0].matched_customer_id || undefined;
  let serverProfile: Record<string, unknown> | undefined;
  if (customerId) {
    const customers = await supabaseRequest<Array<{ address: string | null; business_number: string | null; customer_name: string; phone: string | null }>>(
      `normalized_customers?id=eq.${customerId}&company_id=eq.${share.company_id}&select=customer_name,phone,address,business_number&limit=1`,
    );
    if (!customers[0]) return missing();
    serverProfile = { businessName: customers[0].customer_name, phone: customers[0].phone,
      address: customers[0].address, businessRegistrationNumber: customers[0].business_number };
  }

  const platformIp = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const requester = platformIp && isIP(platformIp) ? `ip:${platformIp}` : "unidentified-requester";
  const guard = await supabaseRequest<string>("rpc/pricing_s2_public_request_guard", { method: "POST", body: JSON.stringify({
    p_company_id: share.company_id,
    p_limit: 10,
    p_payload: { sendId },
    p_requester_hash: shareRequesterHash(`accept:${requester}:${share.id}`),
    p_route_key: "lead-document-accept-v1",
  }) });
  if (guard === "rate_limited") throw new SharedAcceptanceError("요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  if (guard !== "allowed") throw new SharedAcceptanceError("수락 요청을 확인하지 못했습니다.", 503);
  return {
    ...(await actor(request, share.company_id, customerId)),
    companyId: share.company_id,
    customerId,
    customerProfile: serverProfile || input.customerProfile,
    documentId: share.document_id,
    documentVersionId: share.document_version_id,
    leadId: share.lead_id,
    sendId,
  };
}
