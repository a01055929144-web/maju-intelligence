import { randomUUID } from "crypto";
import type {
  PricingAcceptanceCommand,
  PricingAcceptanceRepository,
  PricingAcceptanceResult,
} from "@/domains/pricing/acceptance-order-link";
import { issueStoreLinkToken } from "./store-link-token";
import { supabaseRequest } from "../store";

type RpcResult = Omit<PricingAcceptanceResult, "storefrontToken"> & {
  storefrontTokenHash?: string;
  storefrontTokenNonce?: string;
};

export const pricingAcceptanceRepository: PricingAcceptanceRepository = {
  async accept(command: PricingAcceptanceCommand) {
    const linkId = randomUUID();
    const token = issueStoreLinkToken(linkId);
    const result = await supabaseRequest<RpcResult>(
      "rpc/accept_pricing_document_and_issue_storefront_link",
      {
        method: "POST",
        body: JSON.stringify({
          p_accepted_via: command.acceptedVia,
          p_actor_key: command.actorKey || null,
          p_actor_user_id: command.actorUserId || null,
          p_company_id: command.companyId,
          p_customer_id: command.customerId || null,
          p_customer_profile: command.customerProfile || {},
          p_document_id: command.documentId,
          p_document_version_id: command.documentVersionId,
          p_idempotency_key: command.idempotencyKey,
          p_lead_id: command.leadId || null,
          p_link_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          p_link_hash: token.hash,
          p_link_id: linkId,
          p_link_nonce: token.nonce,
          p_needs_review: command.needsReview || false,
          p_request_fingerprint: command.requestFingerprint,
          p_review_reason: command.reviewReason || null,
          p_send_id: command.sendId || null,
        }),
      },
    );
    if (!result.orderEnabled) return result;
    if (
      !result.storefrontLinkId ||
      !result.storefrontTokenNonce ||
      !result.storefrontTokenHash
    )
      throw new Error("주문 링크 결과를 확인하지 못했습니다.");
    const issued = issueStoreLinkToken(
      result.storefrontLinkId,
      result.storefrontTokenNonce,
    );
    if (issued.hash !== result.storefrontTokenHash)
      throw new Error("주문 링크 서명을 확인하지 못했습니다.");
    return { ...result, storefrontToken: issued.token };
  },
};
