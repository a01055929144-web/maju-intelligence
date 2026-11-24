import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";

// CX-141: 매장 활동 기록과 관계 홈 플래그만 담은 가벼운 모듈(주문·검색 API가 큰 의존성 없이 가져다 쓴다).
export function relationHomeEnabled(companyId: string) {
  return isFeatureEnabled("STORE_RELATION_HOME", companyId);
}

/** 활동 기록(best-effort). 검색어 원문·가격은 보내지 않는다. */
export async function recordStoreActivity(companyId: string, storeAccountId: string, kind: "home" | "document" | "catalog" | "search" | "cart" | "order", refId?: string) {
  if (!relationHomeEnabled(companyId)) return;
  try {
    await supabaseRequest("rpc/record_store_activity_v1", { method: "POST", body: JSON.stringify({
      p_company: companyId, p_account: storeAccountId, p_kind: kind, p_ref: refId && /^[0-9a-f-]{36}$/i.test(refId) ? refId : null }) });
  } catch { /* 기록 실패가 매장 화면을 막지 않는다 */ }
}
