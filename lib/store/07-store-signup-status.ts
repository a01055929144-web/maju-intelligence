import { supabaseRequest } from "../store";

// CX-142 2차: "가입 · 첫 주문 전" 표시용 공용 읽기 함수 하나. 리드 표·지도·대시보드가 모두 이 결과만 쓴다.
export type StoreSignupState = "signed_up" | "ordering";
export type StoreSignupStatus = { newCount: number; leads: Record<string, StoreSignupState> };
const q = encodeURIComponent;
const NEW_DAYS = 7;

/** 거래처(customer) 중 주문이 한 건이라도 있는 것. 0건이면 "첫 주문 전". */
async function customersWithOrders(companyId: string, customerIds: string[]) {
  const ordered = new Set<string>();
  for (let offset = 0; offset < customerIds.length; offset += 100) {
    const chunk = customerIds.slice(offset, offset + 100);
    const rows = await supabaseRequest<Array<{ customer_id: string }>>(
      `store_orders?company_id=eq.${q(companyId)}&customer_id=in.(${chunk.map(q).join(",")})&select=customer_id&limit=1000`);
    rows.forEach(row => ordered.add(row.customer_id));
  }
  return ordered;
}

export async function readStoreSignupStatus(companyId: string, now = Date.now()): Promise<StoreSignupStatus> {
  const company = q(companyId);
  // 리드 쪽: 가입 완료 때 남긴 타임라인 한 줄('store_signup')이 있는 리드. 가입 후 첫 주문이 생기면 "주문 시작"으로 바뀐다.
  const actions = await supabaseRequest<Array<{ lead_id: string }>>(
    `lead_actions?company_id=eq.${company}&action_type=eq.store_signup&select=lead_id&order=created_at.desc&limit=2000`);
  const leadIds = Array.from(new Set(actions.map(action => action.lead_id)));
  const leads: Record<string, StoreSignupState> = {};
  if (leadIds.length) {
    const rows: Array<{ id: string; matched_customer_id: string | null }> = [];
    for (let offset = 0; offset < leadIds.length; offset += 100) {
      rows.push(...await supabaseRequest<Array<{ id: string; matched_customer_id: string | null }>>(
        `business_permit_leads?company_id=eq.${company}&id=in.(${leadIds.slice(offset, offset + 100).map(q).join(",")})&select=id,matched_customer_id&limit=100`));
    }
    const customerIds = Array.from(new Set(rows.flatMap(row => row.matched_customer_id ? [row.matched_customer_id] : [])));
    const ordered = customerIds.length ? await customersWithOrders(companyId, customerIds) : new Set<string>();
    rows.forEach(row => { leads[row.id] = row.matched_customer_id && ordered.has(row.matched_customer_id) ? "ordering" : "signed_up"; });
  }
  // 대시보드: 최근 7일에 가입한 매장 중 첫 주문 전인 곳.
  const since = encodeURIComponent(new Date(now - NEW_DAYS * 86400000).toISOString());
  const accounts = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?company_id=eq.${company}&status=eq.active&created_at=gte.${since}&select=customer_id&limit=1000`);
  const newCustomers = Array.from(new Set(accounts.map(account => account.customer_id)));
  const ordered = newCustomers.length ? await customersWithOrders(companyId, newCustomers) : new Set<string>();
  return { newCount: newCustomers.filter(id => !ordered.has(id)).length, leads };
}
