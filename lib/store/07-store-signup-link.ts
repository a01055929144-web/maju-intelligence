import { createHash } from "crypto";
import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { findLeadCustomerDuplicate } from "../leads";

// CX-142: 거래처 카카오 초대·고객사 링크 가입이 끝난 매장의 마무리(시스템 외식업 확인 + 리드 연결). 기본 OFF + 회사 allowlist.
export function signupLinkEnabled(companyId: string) {
  return isFeatureEnabled("STORE_SIGNUP_LINK", companyId);
}
const q = encodeURIComponent;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type LeadRow = { id: string; business_name: string; address: string | null; phone: string | null; business_number: string | null; matched_customer_id: string | null; status: string };

/**
 * 가입한 매장에 연결할 리드를 찾는다. ① 가입 출발 링크가 리드별 링크면 그 리드 ② 아니면 기존 거래처 등록의 리드 매칭 규칙
 * (findLeadCustomerDuplicate: 사업자번호 일치 → 상호명+전화/주소 일치)을 그대로 쓴다. 후보가 둘 이상이면 연결하지 않는다.
 */
export async function findSignupLeadId(input: { companyId: string; customerId: string; token?: string }): Promise<string | null> {
  const company = q(input.companyId);
  if (input.token) {
    const requests = await supabaseRequest<Array<{ share_link_id: string | null }>>(
      `store_owner_activation_requests?company_id=eq.${company}&invite_token_hash=eq.${hashToken(input.token)}&select=share_link_id&limit=1`);
    const shareLinkId = requests[0]?.share_link_id;
    if (shareLinkId) {
      const links = await supabaseRequest<Array<{ lead_id: string | null }>>(
        `pricing_document_share_links?company_id=eq.${company}&id=eq.${q(shareLinkId)}&select=lead_id&limit=1`);
      if (links[0]?.lead_id) return links[0].lead_id;
    }
  }
  const customers = await supabaseRequest<Array<{ customer_name: string; address: string | null; phone: string | null; business_registration_number: string | null }>>(
    `normalized_customers?company_id=eq.${company}&id=eq.${q(input.customerId)}&select=customer_name,address,phone,business_registration_number&limit=1`);
  const customer = customers[0];
  if (!customer) return null;
  const businessNumber = (customer.business_registration_number || "").replace(/\D/g, "");
  const usableNumber = businessNumber.length === 10 && !/^(\d)\1{9}$/.test(businessNumber);
  const lookup = usableNumber ? `business_number=eq.${q(businessNumber)}` : `business_name=ilike.${q(customer.customer_name)}`;
  const leads = await supabaseRequest<LeadRow[]>(
    `business_permit_leads?select=id,business_name,address,phone,business_number,matched_customer_id,status&company_id=eq.${company}&merged_into_lead_id=is.null&${lookup}&limit=20`);
  const matches = leads.filter(lead => findLeadCustomerDuplicate(
    { address: customer.address || "", businessName: customer.customer_name, businessNumber, phone: customer.phone || "" },
    [{ address: lead.address || "", customerName: lead.business_name, businessNumber: lead.business_number || "", id: lead.id, phone: lead.phone || "" }]));
  return matches.length === 1 ? matches[0].id : null;
}

/** 가입 완료 마무리(best-effort): 실패해도 가입·로그인은 그대로 진행된다. */
export async function finalizeStoreSignup(input: { companyId: string; storeAccountId: string; route: "invite" | "company_link"; token?: string }) {
  if (!signupLinkEnabled(input.companyId)) return;
  try {
    const accounts = await supabaseRequest<Array<{ customer_id: string }>>(
      `store_accounts?company_id=eq.${q(input.companyId)}&id=eq.${q(input.storeAccountId)}&select=customer_id&limit=1`);
    const leadId = accounts[0]?.customer_id
      ? await findSignupLeadId({ companyId: input.companyId, customerId: accounts[0].customer_id, token: input.token }).catch(() => null) : null;
    await supabaseRequest("rpc/finalize_store_signup_v1", { method: "POST", body: JSON.stringify({
      p_company: input.companyId, p_store_account: input.storeAccountId, p_route: input.route, p_lead: leadId }) });
  } catch { console.error("store_signup_finalize_failed", { route: input.route }); }
}

/** 초대 링크를 열었다는 기록(횟수·시각). 가입 전이라 사람은 알 수 없고, 가입하면 가입자가 남는다. */
export async function recordInviteOpen(companyId: string | null, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const rows = await supabaseRequest<Array<{ company_id: string }>>(
    `store_owner_activation_requests?invite_token_hash=eq.${hashToken(token)}&select=company_id&limit=1`);
  const company = rows[0]?.company_id;
  if (!company || !signupLinkEnabled(company) || (companyId && companyId !== company)) return false;
  const result = await supabaseRequest<boolean | boolean[]>("rpc/record_store_invite_open_v1", { method: "POST", body: JSON.stringify({ p_invite_token_hash: hashToken(token) }) });
  return (Array.isArray(result) ? result[0] : result) === true;
}

export async function readInviteStatus(companyId: string, customerId: string) {
  if (!signupLinkEnabled(companyId)) return null;
  const rows = await supabaseRequest<Array<{ open_count: number; first_opened_at: string | null; last_opened_at: string | null; consumed_at: string | null; cancelled_at: string | null; expires_at: string }>>(
    `store_owner_activation_requests?company_id=eq.${q(companyId)}&customer_id=eq.${q(customerId)}&select=open_count,first_opened_at,last_opened_at,consumed_at,cancelled_at,expires_at&order=prepared_at.desc&limit=1`);
  const row = rows[0];
  return row ? { openCount: row.open_count, firstOpenedAt: row.first_opened_at, lastOpenedAt: row.last_opened_at,
    signedUp: Boolean(row.consumed_at), expired: !row.consumed_at && Date.parse(row.expires_at) <= Date.now(), cancelled: Boolean(row.cancelled_at) } : null;
}
