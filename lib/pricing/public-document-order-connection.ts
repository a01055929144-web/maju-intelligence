import "server-only";
import { randomUUID } from "crypto";
import { supabaseRequest } from "../store";
import { getStoreOrderMemberContextForCompany } from "../store/07-store-member-context";
import { DocumentSendError } from "../../domains/pricing/document-send";
import { isId } from "../../domains/pricing/document";
import { issueStoreLinkToken } from "./store-link-token";
import { equalShareHash } from "./document-share-token";
import type { getPublicDocumentOrderContext } from "./document-share";

/** All issuer scope comes from the verified public link; all store scope comes from the 07 session. */
export async function connectPublicDocumentOrder(context: Awaited<ReturnType<typeof getPublicDocumentOrderContext>>) {
  const member = await getStoreOrderMemberContextForCompany(context.companyId);
  if (!member) return null;
  const customerId = member.customerId;
  if (member.companyId !== context.companyId || member.status !== "active" || !isId(customerId) || !isId(member.authUserId))
    throw new DocumentSendError("매장 권한을 확인하지 못했습니다. 다시 로그인해 주세요.", 404);
  const id = randomUUID(), issued = issueStoreLinkToken(id);
  const rows = await supabaseRequest<Array<{ issued_customer_id: string; issued_link_id: string; issued_token_nonce: string; issued_token_hash: string }>>(
    "rpc/issue_storefront_links", { method: "POST", body: JSON.stringify({ p_company: context.companyId,
      p_document_version: context.documentVersionId, p_links: [{ id, customerId, nonce: issued.nonce, hash: issued.hash }],
      p_expires_at: context.expiresAt, p_actor_key: context.issuerActorKey, p_actor_user_id: member.authUserId }) });
  if (rows.length !== 1 || rows[0].issued_customer_id !== customerId) throw new Error("Order connection unconfirmed");
  const token = issueStoreLinkToken(rows[0].issued_link_id, rows[0].issued_token_nonce);
  if (!equalShareHash(token.hash, rows[0].issued_token_hash)) throw new Error("Order link signing configuration changed");
  return { next: "order" as const, storeUrl: `/store#${token.token}` };
}
