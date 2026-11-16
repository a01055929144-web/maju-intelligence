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
  documents: Array<{ title: string; industry?: string; kind: "sheet" | "quote"; href: string; canOrder: boolean; validUntil: string; itemCount?: number }>;
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
    const receivedHome = isFeatureEnabled("STORE_RECEIVED_DOCUMENTS_HOME", row.company_id);
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
    const catalog = catalogs[0];
    const catalogToken = catalog ? issueStoreLinkToken(catalog.id, catalog.token_nonce) : null;
    const catalogHref = catalogToken && catalogToken.hash === catalog?.token_hash ? `/store?view=order#${catalogToken.token}` : undefined;
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
        validUntil: content.validUntil, itemCount: content.lines?.filter(line => line.visible).length }];
    });
    documents.push(...await readStorePortalSourceDocuments(row.company_id,row.store_account_id,row.store_accounts!.customer_id));
    const canManage = row.role === "owner" || row.role === "manager";
    const businessType = companies[0]?.business_type?.trim() || "";
    return { companyId: row.company_id, storeAccountId: row.store_account_id, ...(businessType ? { businessType } : {}),
      companyName: companies[0]?.name ?? undefined, catalogHref,
      customerName: customers[0]?.customer_name || "이름 없는 매장", documents,
      hasCostAccess: isFeatureEnabled("STORE_COSTS", row.company_id), canManageMembers: canManage,
      canManageAddress: canManage && isStoreAddressCompanyEnabled(row.company_id) };
  }));
}

export type StorePortalOrder = {
  lines?: Array<{ id: string; product_name: string; specification: string; sales_unit: string;
    quantity: number; unit_price: number | null; total_amount: number | null }>;
  id: string; delivery_date: string | null; status: string; known_total: number; submitted_at: string; has_market_price: boolean;
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
  return supabaseRequest<StorePortalOrder[]>(
    `store_orders?company_id=eq.${company}&customer_id=eq.${encodeURIComponent(customer)}` +
    `&or=(store_account_id.eq.${account},store_account_id.is.null)` +
    "&select=id,delivery_date,status,known_total,submitted_at,has_market_price" +
    (includeLines ? ",lines:store_order_lines!store_order_lines_order_fk(id,product_name,specification,sales_unit,quantity,unit_price,total_amount)" : "") +
    "&order=submitted_at.desc,id.desc&limit=20",
  );
}
