import "server-only";
import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { normalizeOwnerMobile } from "../../domains/store/owner-phone";

// CX-146 고객사 쪽: 거래처 '점주 휴대폰' 입력과 알림(겹침·거절) 조회. 번호는 뒤 4자리만 내보낸다(저장값은 서버 안에만).

const q = encodeURIComponent;
export type OwnerMobileState = { registered: boolean; last4: string | null; notices: Array<{ id: string; kind: "declined" | "owner_conflict"; phoneLast4: string; createdAt: string }> };

export const phoneLinkEnabledFor = (companyId: string) => isFeatureEnabled("STORE_PHONE_LINK", companyId);

export async function readOwnerMobileState(companyId: string, customerId: string): Promise<OwnerMobileState> {
  const [customers, notices] = await Promise.all([
    supabaseRequest<Array<{ owner_mobile: string | null }>>(`normalized_customers?select=owner_mobile&company_id=eq.${q(companyId)}&id=eq.${q(customerId)}&limit=1`),
    supabaseRequest<Array<{ id: string; kind: "declined" | "owner_conflict"; phone_last4: string; created_at: string }>>(
      `store_phone_link_notices?select=id,kind,phone_last4,created_at&company_id=eq.${q(companyId)}&customer_id=eq.${q(customerId)}&resolved_at=is.null&order=created_at.desc&limit=20`),
  ]);
  const mobile = customers[0]?.owner_mobile ?? null;
  return { registered: Boolean(mobile), last4: mobile ? mobile.slice(-4) : null,
    notices: notices.map(row => ({ id: row.id, kind: row.kind, phoneLast4: row.phone_last4, createdAt: row.created_at })) };
}

/** null/빈 값이면 지운다. 010 휴대폰이 아니면 false(저장 안 함). */
export async function saveOwnerMobile(companyId: string, customerId: string, raw: unknown) {
  const empty = raw === null || (typeof raw === "string" && raw.trim() === "");
  const mobile = empty ? null : normalizeOwnerMobile(raw);
  if (!empty && !mobile) return false;
  await supabaseRequest(`normalized_customers?company_id=eq.${q(companyId)}&id=eq.${q(customerId)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ owner_mobile: mobile }) });
  return true;
}

export async function resolveOwnerMobileNotice(companyId: string, customerId: string, noticeId: string) {
  await supabaseRequest(`store_phone_link_notices?company_id=eq.${q(companyId)}&customer_id=eq.${q(customerId)}&id=eq.${q(noticeId)}&resolved_at=is.null`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ resolved_at: new Date().toISOString() }) });
}
