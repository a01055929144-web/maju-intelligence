import { supabaseRequest } from "../store";

// CC-08: 초대 코드로 연결된 매장의 "첫 거래 거래처 확인". 규칙은 DB 함수(CX-13)가 정하고, 여기서는 호출과 오류 문구 변환만 한다.
export class StoreReviewError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export type ReviewCandidate = { customerId: string; name: string; address: string | null; reason: "business_number" | "name_address" };

const MESSAGES: Array<[string, string, number]> = [
  ["store_account_not_pending_review", "이미 확인이 끝난 매장입니다. 새로고침해 주세요.", 409],
  ["store_review_target_has_store_account", "그 거래처는 이미 다른 매장 계정과 연결돼 있습니다.", 409],
  ["store_review_placeholder_in_use", "자동으로 만든 거래처에 다른 기록(가격·문서·배송 등)이 있어 연결할 수 없습니다. '새 거래처로 확인'을 쓰세요.", 409],
  ["store_review_customer_not_auto_created", "자동으로 만든 거래처가 아니어서 연결할 수 없습니다.", 409],
  ["store_review_customer_not_found", "연결할 거래처를 찾을 수 없습니다.", 404],
  ["store_review_same_customer", "이미 이 거래처입니다.", 400],
  ["store_account_not_found", "매장 계정을 찾을 수 없습니다.", 404],
];

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  try { return await supabaseRequest<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) }); }
  catch (e) {
    const text = e instanceof Error ? e.message : "";
    const hit = MESSAGES.find(([code]) => text.includes(code));
    if (hit) throw new StoreReviewError(hit[1], hit[2]);
    throw e;
  }
}

export const reviewCandidates = (companyId: string, storeAccountId: string) =>
  rpc<ReviewCandidate[]>("store_customer_review_candidates_v1", { p_company: companyId, p_store_account: storeAccountId });
export const confirmNewCustomer = (companyId: string, storeAccountId: string, actor: { userId?: string | null; name: string }) =>
  rpc<{ customerId: string; alreadyConfirmed: boolean }>("confirm_store_customer_v1", { p_company: companyId, p_store_account: storeAccountId, p_actor: actor.userId || null, p_actor_name: actor.name });
export const linkExistingCustomer = (companyId: string, storeAccountId: string, customerId: string, actor: { userId?: string | null; name: string }) =>
  rpc<{ customerId: string; movedOrders: number }>("link_store_account_to_customer_v1", { p_company: companyId, p_store_account: storeAccountId, p_customer: customerId, p_actor: actor.userId || null, p_actor_name: actor.name });
