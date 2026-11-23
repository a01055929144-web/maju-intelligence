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
export async function connectPublicDocumentOrder(
  context: Awaited<ReturnType<typeof getPublicDocumentOrderContext>>,
  draft: ReadonlyArray<{ key: string; quantity: number }> = [],
) {
  const orderCutoff = Date.parse(context.orderExpiresAt);
  if (!Number.isFinite(orderCutoff) || orderCutoff <= Date.now())
    throw new DocumentSendError("가격·주문 유효기간이 지났습니다. 발행 회사에 새 문서를 요청해 주세요.", 404);
  const member = await getStoreOrderMemberContextForCompany(context.companyId);
  if (!member) return null;
  const customerId = member.customerId;
  if (member.companyId !== context.companyId || member.status !== "active" || !isId(customerId) || !isId(member.authUserId))
    throw new DocumentSendError("매장 권한을 확인하지 못했습니다. 다시 로그인해 주세요.", 404);
  const eligible = new Map(context.items.flatMap(item => item ? [[item.key, item] as const] : []));
  const selected = draft.map(line => ({ item: eligible.get(line.key), quantity: line.quantity }));
  if (selected.some(line => !line.item))
    throw new DocumentSendError("담은 품목의 판매 상태가 바뀌었습니다. 단가표에서 수량을 다시 확인해 주세요.", 409);
  const id = randomUUID(), issued = issueStoreLinkToken(id);
  const rows = await supabaseRequest<Array<{ issued_customer_id: string; issued_link_id: string; issued_token_nonce: string; issued_token_hash: string }>>(
    "rpc/issue_storefront_links", { method: "POST", body: JSON.stringify({ p_company: context.companyId,
      p_document_version: context.documentVersionId, p_links: [{ id, customerId, nonce: issued.nonce, hash: issued.hash }],
      p_expires_at: context.orderExpiresAt, p_actor_key: context.issuerActorKey, p_actor_user_id: member.authUserId }) });
  if (rows.length !== 1 || rows[0].issued_customer_id !== customerId) throw new Error("Order connection unconfirmed");
  const token = issueStoreLinkToken(rows[0].issued_link_id, rows[0].issued_token_nonce);
  if (!equalShareHash(token.hash, rows[0].issued_token_hash)) throw new Error("Order link signing configuration changed");
  const cart = [];
  if (draft.length) {
    const scope = { p_company: context.companyId, p_account: member.storeAccountId, p_user: member.authUserId };
    const existing = await supabaseRequest<Array<{ product_id: string; promotion_id: string | null; quantity: number }>>(
      "rpc/store_order_cart_lines", { method: "POST", body: JSON.stringify(scope) });
    for (const { item, quantity } of selected) {
      if (!item) continue;
      const saved = existing.find(line => line.product_id === item.productId && line.promotion_id === item.promotionId);
      if (!saved) await supabaseRequest("rpc/save_store_order_cart_line", {
        method: "POST", body: JSON.stringify({ ...scope, p_product: item.productId, p_promotion: item.promotionId, p_quantity: quantity }),
      });
      cart.push({ productId: item.productId, promotionId: item.promotionId, quantity: saved?.quantity ?? quantity });
    }
  }
  return { next: "order" as const, ...(cart.length ? { cart } : {}), storeUrl: `/store?products=all#${token.token}` };
}
