import "server-only";

import { getStoreSession } from "../auth";
import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { issueStoreLinkToken } from "../pricing/store-link-token";
import { isStoreMemberCompanyAllowlisted } from "./07-store-member-feature";
import { isStoreAddressCompanyEnabled } from "./07-store-address-management";
import { readStorePortalSourceDocuments } from "../pricing/store-portal-source-documents";
import { isStoreAccountRole } from "../../domains/organization/store-cost-access";
import { getStoreMemberContext } from "./07-store-member-context";
import { hasActiveStoreMembership } from "./08-store-cost-access";
import { getStoreSettlementAccount, type StoreSettlementAccount } from "./07-store-settlement-account";
import { storeConnectionEnabled } from "./07-store-connection";
import { readStoreRelationHome, relationHomeEnabled, type StoreRelation } from "./07-store-relation-home";

type Membership = { company_id: string; store_account_id: string; role: string; store_accounts: { customer_id: string } | null };
type StoreLink = { id: string; token_nonce: string; token_hash: string; document_version_id: string; expires_at: string; can_order: boolean };
type DocumentVersion = { id: string; content: { kind: "sheet" | "quote"; title: string; industry?: string; validUntil: string; showPrice: boolean; lines?: Array<{ visible?: boolean }> } };

export type StorePortalAccount = {
  companyId: string;
  storeAccountId: string;
  customerName: string;
  businessType?: string;
  companyName?: string;
  catalogHref?: string;
  hasCostAccess: boolean;
  canManageMembers: boolean;
  canManageAddress: boolean;
  settlementAccount?: StoreSettlementAccount;
  documents: Array<{ title: string; industry?: string; kind: "sheet" | "quote"; href: string; canOrder: boolean; validUntil: string; itemCount?: number }>;
  /** CX-141: 관계 기준 홈(플래그 켠 회사만). 확인 전이면 가격 없는 상품 목록만 담는다. */
  relation?: StoreRelation;
  /** CX-144 U1: 매장 탈퇴(연결 관리) 사용 가능 여부. 꺼져 있으면 메뉴를 보이지 않는다. */
  connectionEnabled?: boolean;
};

export async function hasAllowedStorePortalMembership(authUserId: string, companyId?: string) {
  if (!(await hasActiveStoreMembership(authUserId))) return false;
  const rows = await supabaseRequest<Array<{ company_id: string }>>(
    `store_account_members?select=company_id,store_accounts!store_account_members_company_id_store_account_id_fkey!inner(id)&auth_user_id=eq.${encodeURIComponent(authUserId)}` +
    `&status=eq.active&store_accounts.status=eq.active&store_accounts.business_status=in.(active,registration_pending)&limit=20` +
    (companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "")
  );
  return rows.some(row => (!companyId || row.company_id === companyId) && isStoreMemberCompanyAllowlisted(row.company_id));
}

/** A Kakao session, never a link token or URL parameter, chooses the visible stores. */
export async function listStorePortalAccounts(): Promise<StorePortalAccount[] | null> {
  const session = await getStoreSession();
  if (!session) return null;
  if (!(await hasActiveStoreMembership(session.authUserId))) return [];
  const memberships = await supabaseRequest<Membership[]>(
    `store_account_members?select=company_id,store_account_id,role,store_accounts!store_account_members_company_id_store_account_id_fkey!inner(customer_id)` +
    `&auth_user_id=eq.${encodeURIComponent(session.authUserId)}&status=eq.active` +
    `&store_accounts.status=eq.active&store_accounts.business_status=in.(active,registration_pending)&limit=20`
  );
  return Promise.all(memberships.filter(row => row.store_accounts?.customer_id && isStoreAccountRole(row.role) &&
    isStoreMemberCompanyAllowlisted(row.company_id) && isFeatureEnabled("PRICING", row.company_id) &&
    isFeatureEnabled("STORE_ORDERING", row.company_id)).map(async row => {
    const company = encodeURIComponent(row.company_id), customer = encodeURIComponent(row.store_accounts!.customer_id);
    const relationHome = relationHomeEnabled(row.company_id);
    const receivedHome = isFeatureEnabled("STORE_RECEIVED_DOCUMENTS_HOME", row.company_id) || relationHome;
    const [customers, links, companies, catalogs] = await Promise.all([
      supabaseRequest<Array<{ customer_name: string }>>(
        `normalized_customers?company_id=eq.${company}&id=eq.${customer}&select=customer_name&limit=1`),
      supabaseRequest<StoreLink[]>(
        `storefront_links?company_id=eq.${company}&customer_id=eq.${customer}&document_version_id=not.is.null&revoked_at=is.null` +
        `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
        `&select=id,token_nonce,token_hash,document_version_id,expires_at,can_order&order=issued_at.desc&limit=20`),
      supabaseRequest<Array<{ business_type: string | null; name: string | null }>>(
        `companies?id=eq.${company}&select=business_type,name&limit=1`),
      receivedHome && isFeatureEnabled("STORE_CATALOG_LINK", row.company_id) ? supabaseRequest<StoreLink[]>(
        `storefront_links?company_id=eq.${company}&customer_id=eq.${customer}&source=eq.catalog&revoked_at=is.null&can_order=is.true` +
        `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,token_nonce,token_hash&order=issued_at.desc&limit=1`
      ) : [],
    ]);
    const versions = links.length ? await supabaseRequest<DocumentVersion[]>(
      `pricing_document_versions?company_id=eq.${company}&id=in.(${links.map(link => encodeURIComponent(link.document_version_id)).join(",")})` +
      `&published_at=not.is.null&select=id,content&limit=20`
    ) : [];
    const byVersion = new Map(versions.map(version => [version.id, version.content]));
    const documents: StorePortalAccount["documents"] = links.flatMap(link => {
      const content = byVersion.get(link.document_version_id);
      if (!content || !["sheet", "quote"].includes(content.kind)) return [];
      const token = issueStoreLinkToken(link.id, link.token_nonce);
      if (token.hash !== link.token_hash) return [];
      const industry = content.industry?.trim() || companies[0]?.business_type?.trim() || "";
      return [{ title: content.title, ...(industry ? { industry } : {}), kind: content.kind, href: `/store#${token.token}`,
        canOrder: link.can_order && content.showPrice && content.validUntil >= new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
        validUntil: content.validUntil, ...(receivedHome && Array.isArray(content.lines) ? { itemCount: content.lines.filter(line => line.visible).length } : {}) }];
    });
    let relation: StoreRelation | undefined, relationCatalog: Awaited<ReturnType<typeof readStoreRelationHome>>["catalog"] = null;
    if (relationHome) {
      try {
        const home = await readStoreRelationHome({ companyId: row.company_id, storeAccountId: row.store_account_id, customerId: row.store_accounts!.customer_id,
          authUserId: session.authUserId, knownVersionIds: new Set(links.map(link => link.document_version_id)) });
        relation = home.relation; relationCatalog = home.catalog;
        const have = new Set(documents.map(document => document.href));
        documents.push(...home.documents.filter(document => !have.has(document.href)));
      } catch { relation = undefined; /* 관계 홈이 실패해도 기존 홈은 그대로 */ }
    } else documents.push(...await readStorePortalSourceDocuments(row.company_id,row.store_account_id,row.store_accounts!.customer_id));
    const catalog = catalogs[0] ?? relationCatalog ?? undefined;
    const catalogToken = catalog ? issueStoreLinkToken(catalog.id, catalog.token_nonce) : null;
    const catalogHref = catalogToken && catalogToken.hash === catalog?.token_hash ? `/store?view=order#${catalogToken.token}` : undefined;
    const canManage = row.role === "owner" || row.role === "manager";
    const settlementAccount = await getStoreSettlementAccount({ companyId: row.company_id, storeAccountId: row.store_account_id });
    const businessType = companies[0]?.business_type?.trim() || "";
    return { companyId: row.company_id, storeAccountId: row.store_account_id, ...(businessType ? { businessType } : {}),
      ...(receivedHome && companies[0]?.name ? { companyName: companies[0].name } : {}),
      ...(catalogHref ? { catalogHref } : {}), ...(relation ? { relation } : {}),
      ...(storeConnectionEnabled(row.company_id) ? { connectionEnabled: true } : {}),
      customerName: customers[0]?.customer_name || "이름 없는 매장", documents,
      ...(settlementAccount ? { settlementAccount } : {}),
      hasCostAccess: isFeatureEnabled("STORE_COSTS", row.company_id), canManageMembers: canManage,
      canManageAddress: canManage && isStoreAddressCompanyEnabled(row.company_id) };
  }));
}

export type StorePortalOrder = {
  lines?: Array<{ id: string; product_name: string; specification: string; sales_unit: string;
    quantity: number; unit_price: number | null; total_amount: number | null }>;
  id: string; delivery_date: string | null; status: string; known_total: number; submitted_at: string; has_market_price: boolean;
  document?: {
    id: string; revision: number; documentNumber: string; totalAmount: number;
    lines: Array<{ id: string; name: string; specification?: string; unit: string; quantity: number; unitPrice: number; lineAmount: number }>;
    receipt?: { status: "confirmed" | "disputed"; revision: number; confirmedAt: string; memberName: string; memo?: string };
  };
};

/** Match existing link history by customer, with an account boundary for member orders. */
export async function listStorePortalOrders(scope: Pick<StorePortalAccount, "companyId" | "storeAccountId">, includeLines = false) {
  const member = await getStoreMemberContext(scope);
  if (!member) return [];
  const company = encodeURIComponent(member.companyId), account = encodeURIComponent(member.storeAccountId);
  const stores = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?select=customer_id&company_id=eq.${company}&id=eq.${account}&status=eq.active&business_status=in.(active,registration_pending)&limit=1`,
  );
  const customer = stores[0]?.customer_id;
  if (!customer) return [];
  const orders = await supabaseRequest<StorePortalOrder[]>(
    `store_orders?company_id=eq.${company}&customer_id=eq.${encodeURIComponent(customer)}` +
    `&or=(store_account_id.eq.${account},store_account_id.is.null)` +
    "&select=id,delivery_date,status,known_total,submitted_at,has_market_price" +
    (includeLines ? ",lines:store_order_lines!store_order_lines_order_fk(id,product_name,specification,sales_unit,quantity,unit_price,total_amount)" : "") +
    "&order=submitted_at.desc,id.desc&limit=20",
  );
  if (!orders.length || !isFeatureEnabled("ERP_ORDER_DOCUMENTS", member.companyId)) return orders;
  const sourceKeys = orders.map(order => encodeURIComponent(`order:${order.id}`)).join(",");
  const documents = await supabaseRequest<Array<{ id: string; source_key: string; revision: number; document_number: string; total_amount: number }>>(
    `business_documents?select=id,source_key,revision,document_number,total_amount&company_id=eq.${company}&customer_id=eq.${encodeURIComponent(customer)}` +
    `&document_type=eq.sale&status=eq.confirmed&source_type=eq.order&source_key=in.(${sourceKeys})&limit=20`,
  );
  if (!documents.length) return orders;
  const documentIds = documents.map(document => encodeURIComponent(document.id)).join(",");
  const [lines, receipts] = await Promise.all([
    supabaseRequest<Array<{ id: string; document_id: string; product_name_snapshot: string; specification_snapshot: string | null; unit_snapshot: string; quantity: number; unit_price: number; total_amount: number }>>(
      `business_document_lines?select=id,document_id,product_name_snapshot,specification_snapshot,unit_snapshot,quantity,unit_price,total_amount&company_id=eq.${company}&document_id=in.(${documentIds})&order=sort_order.asc`,
    ),
    supabaseRequest<Array<{ document_id: string; revision: number; status: "confirmed" | "disputed"; confirmed_at: string; memo: string | null; store_member_id: string }>>(
      `business_document_receipts?select=document_id,revision,status,confirmed_at,memo,store_member_id&company_id=eq.${company}&document_id=in.(${documentIds})&order=confirmed_at.desc`,
    ),
  ]);
  const memberIds = Array.from(new Set(receipts.map(receipt => receipt.store_member_id)));
  const members = memberIds.length ? await supabaseRequest<Array<{ id: string; app_users: { name: string } | null }>>(
    `store_account_members?select=id,app_users(name)&company_id=eq.${company}&store_account_id=eq.${account}&id=in.(${memberIds.map(encodeURIComponent).join(",")})`,
  ) : [];
  const memberNames = new Map(members.map(member => [member.id, member.app_users?.name || "매장 구성원"]));
  const bySource = new Map(documents.map(document => [document.source_key, document]));
  return orders.map(order => {
    const document = bySource.get(`order:${order.id}`);
    if (!document) return order;
    const receipt = receipts.find(item => item.document_id === document.id);
    return { ...order, document: {
      id: document.id, revision: document.revision, documentNumber: document.document_number, totalAmount: Number(document.total_amount),
      lines: lines.filter(line => line.document_id === document.id).map(line => ({ id: line.id, name: line.product_name_snapshot,
        ...(line.specification_snapshot ? { specification: line.specification_snapshot } : {}), unit: line.unit_snapshot,
        quantity: Number(line.quantity), unitPrice: Number(line.unit_price), lineAmount: Number(line.total_amount) })),
      ...(receipt ? { receipt: { status: receipt.status, revision: receipt.revision, confirmedAt: receipt.confirmed_at, memberName: memberNames.get(receipt.store_member_id) || "매장 구성원",
        ...(receipt.memo ? { memo: receipt.memo } : {}) } } : {})
    } };
  });
}
