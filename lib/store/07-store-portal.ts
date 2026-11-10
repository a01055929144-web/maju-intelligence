import "server-only";

import { getStoreSession } from "../auth";
import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { issueStoreLinkToken } from "../pricing/store-link-token";
import { isStoreMemberCompanyAllowlisted } from "./07-store-member-feature";
import { isStoreAddressCompanyEnabled } from "./07-store-address-management";
import { readStorePortalSourceDocuments } from "../pricing/store-portal-source-documents";
import { hasActiveStoreMembership } from "./08-store-cost-access";

type Membership = { company_id: string; store_account_id: string; role: string; store_accounts: { customer_id: string } | null };
type StoreLink = { id: string; token_nonce: string; token_hash: string; document_version_id: string; expires_at: string; can_order: boolean };
type DocumentVersion = { id: string; content: { kind: "sheet" | "quote"; title: string; validUntil: string; showPrice: boolean } };

export type StorePortalAccount = {
  companyId: string;
  storeAccountId: string;
  customerName: string;
  hasCostAccess: boolean;
  canManageMembers: boolean;
  canManageAddress: boolean;
  documents: Array<{ title: string; kind: "sheet" | "quote"; href: string; canOrder: boolean; validUntil: string }>;
};

export async function hasAllowedStorePortalMembership(authUserId: string) {
  if (!(await hasActiveStoreMembership(authUserId))) return false;
  const rows = await supabaseRequest<Array<{ company_id: string }>>(
    `store_account_members?select=company_id,store_accounts!inner(id)&auth_user_id=eq.${encodeURIComponent(authUserId)}` +
    `&status=eq.active&store_accounts.status=eq.active&store_accounts.business_status=in.(active,registration_pending)&limit=20`
  );
  return rows.some(row => isStoreMemberCompanyAllowlisted(row.company_id));
}

/** A Kakao session, never a link token or URL parameter, chooses the visible stores. */
export async function listStorePortalAccounts(): Promise<StorePortalAccount[] | null> {
  const session = await getStoreSession();
  if (!session) return null;
  if (!(await hasActiveStoreMembership(session.authUserId))) return [];
  const memberships = await supabaseRequest<Membership[]>(
    `store_account_members?select=company_id,store_account_id,role,store_accounts!inner(customer_id)` +
    `&auth_user_id=eq.${encodeURIComponent(session.authUserId)}&status=eq.active` +
    `&store_accounts.status=eq.active&store_accounts.business_status=in.(active,registration_pending)&limit=20`
  );
  return Promise.all(memberships.filter(row => row.store_accounts?.customer_id &&
    isStoreMemberCompanyAllowlisted(row.company_id) && isFeatureEnabled("PRICING", row.company_id) &&
    isFeatureEnabled("STORE_ORDERING", row.company_id)).map(async row => {
    const company = encodeURIComponent(row.company_id), customer = encodeURIComponent(row.store_accounts!.customer_id);
    const [customers, links] = await Promise.all([
      supabaseRequest<Array<{ customer_name: string }>>(
        `normalized_customers?company_id=eq.${company}&id=eq.${customer}&select=customer_name&limit=1`),
      supabaseRequest<StoreLink[]>(
        `storefront_links?company_id=eq.${company}&customer_id=eq.${customer}&revoked_at=is.null` +
        `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
        `&select=id,token_nonce,token_hash,document_version_id,expires_at,can_order&order=issued_at.desc&limit=20`),
    ]);
    const versions = links.length ? await supabaseRequest<DocumentVersion[]>(
      `pricing_document_versions?company_id=eq.${company}&id=in.(${links.map(link => encodeURIComponent(link.document_version_id)).join(",")})` +
      `&published_at=not.is.null&select=id,content&limit=20`
    ) : [];
    const byVersion = new Map(versions.map(version => [version.id, version.content]));
    const documents = links.flatMap(link => {
      const content = byVersion.get(link.document_version_id);
      if (!content || !["sheet", "quote"].includes(content.kind)) return [];
      const token = issueStoreLinkToken(link.id, link.token_nonce);
      if (token.hash !== link.token_hash) return [];
      return [{ title: content.title, kind: content.kind, href: `/store#${token.token}`,
        canOrder: link.can_order && content.showPrice && content.validUntil >= new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
        validUntil: content.validUntil }];
    });
    documents.push(...await readStorePortalSourceDocuments(row.company_id,row.store_account_id,row.store_accounts!.customer_id));
    const canManage = row.role === "owner" || row.role === "manager";
    return { companyId: row.company_id, storeAccountId: row.store_account_id,
      customerName: customers[0]?.customer_name || "이름 없는 매장", documents,
      hasCostAccess: isFeatureEnabled("STORE_COSTS", row.company_id), canManageMembers: canManage,
      canManageAddress: canManage && isStoreAddressCompanyEnabled(row.company_id) };
  }));
}
