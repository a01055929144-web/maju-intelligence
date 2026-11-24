
import { createHash, randomUUID } from "crypto";
import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { issueStoreLinkToken } from "../pricing/store-link-token";
import { readStorePortalSourceDocuments } from "../pricing/store-portal-source-documents";
import { companyLinkOverview } from "../pricing/company-links";

import { relationHomeEnabled } from "./07-store-activity";
export { relationHomeEnabled };

// CX-141: 링크 없이 "거래 관계" 기준으로 매장 홈을 채운다. 기본 OFF + 회사 allowlist(STORE_RELATION_HOME).
// 가격은 self_order_price_v2(store_member_catalog_v2 안)와 기존 링크 경로만 쓰고, 매입가는 어떤 응답에도 넣지 않는다.

export type RelationDocument = { title: string; industry?: string; kind: "sheet" | "quote"; href: string; canOrder: boolean; validUntil: string; itemCount?: number };
export type RelationProduct = { name: string; spec: string; unit: string; category: string };
export type StoreRelation = { confirmed: boolean; products?: RelationProduct[] };
type LinkRow = { id: string; token_nonce: string; token_hash: string };
type IssueRow = { issued_link_id: string; issued_token_nonce: string; issued_token_hash: string };

const q = encodeURIComponent;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 외식업 확인 여부(CX-122). 확인 전에는 가격·주문이 없다. */
export async function storePriceConfirmed(companyId: string, storeAccountId: string) {
  const result = await supabaseRequest<boolean | boolean[]>("rpc/store_price_visible_v1", {
    method: "POST", body: JSON.stringify({ p_company: companyId, p_store_account: storeAccountId }) });
  return (Array.isArray(result) ? result[0] : result) === true;
}

function systemActor(companyId: string) {
  return createHash("sha256").update(`${companyId}:cx141:store-relation-home`).digest("hex");
}

/** 그 매장(고객사) 앞으로 전체 상품 링크 1개 보장. 발급 함수가 회사 행을 잠그고 기존 링크를 돌려주므로 동시 요청에도 1개. */
export async function ensureStoreCatalogLink(companyId: string, customerId: string): Promise<LinkRow | null> {
  if (!isFeatureEnabled("STORE_CATALOG_LINK", companyId)) return null;
  const now = encodeURIComponent(new Date().toISOString());
  const existing = await supabaseRequest<LinkRow[]>(
    `storefront_links?company_id=eq.${q(companyId)}&customer_id=eq.${q(customerId)}&source=eq.catalog&revoked_at=is.null&can_order=is.true` +
    `&expires_at=gt.${now}&select=id,token_nonce,token_hash&order=issued_at.desc&limit=1`);
  if (existing[0]) return existing[0];
  const id = randomUUID();
  const issued = issueStoreLinkToken(id);
  const rows = await supabaseRequest<IssueRow[]>("rpc/issue_catalog_storefront_links_v1", { method: "POST", body: JSON.stringify({
    p_company: companyId, p_links: [{ customerId, id, nonce: issued.nonce, hash: issued.hash }],
    p_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(), p_actor_user_id: null }) });
  const row = rows[0];
  return row ? { id: row.issued_link_id, token_nonce: row.issued_token_nonce, token_hash: row.issued_token_hash } : null;
}

type Version = { id: string; document_id: string; content: { kind: "sheet" | "quote"; title: string; industry?: string; validUntil: string; showPrice: boolean; lines?: Array<{ visible?: boolean }> } };

/** 이 고객사 앞으로 보낸 문서(pricing_document_sends)를 매장 링크로 연결한다. 확인된 매장만, 같은 (고객사, 버전)은 1개(발급 함수가 보장). */
async function sentDocuments(companyId: string, customerId: string, known: Set<string>): Promise<RelationDocument[]> {
  const sends = await supabaseRequest<Array<{ document_version_id: string }>>(
    `pricing_document_sends?company_id=eq.${q(companyId)}&customer_id=eq.${q(customerId)}&acceptance_status=in.(sent,viewed,accepted)` +
    `&select=document_version_id&order=sent_at.desc&limit=20`);
  const ids = Array.from(new Set(sends.map(send => send.document_version_id))).filter(id => !known.has(id)).slice(0, 5);
  if (!ids.length) return [];
  const versions = await supabaseRequest<Version[]>(
    `pricing_document_versions?company_id=eq.${q(companyId)}&id=in.(${ids.map(q).join(",")})&published_at=not.is.null&select=id,document_id,content&limit=5`);
  const day = today();
  const out: RelationDocument[] = [];
  for (const version of versions) {
    const content = version.content;
    if (!content || !["sheet", "quote"].includes(content.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(content.validUntil) || content.validUntil < day) continue;
    try {
      const id = randomUUID(), token = issueStoreLinkToken(id);
      const rows = await supabaseRequest<IssueRow[]>("rpc/issue_storefront_links", { method: "POST", body: JSON.stringify({
        p_company: companyId, p_document_version: version.id, p_links: [{ customerId, id, nonce: token.nonce, hash: token.hash }],
        p_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(), p_actor_key: systemActor(companyId), p_actor_user_id: null }) });
      const row = rows[0];
      if (!row) continue;
      const issuedToken = issueStoreLinkToken(row.issued_link_id, row.issued_token_nonce);
      if (issuedToken.hash !== row.issued_token_hash) continue;
      out.push({ title: content.title, kind: content.kind, href: `/store#${issuedToken.token}`, canOrder: content.showPrice, validUntil: content.validUntil,
        ...(Array.isArray(content.lines) ? { itemCount: content.lines.filter(line => line.visible).length } : {}) });
    } catch { /* 한 문서가 막혀도 홈은 계속 열린다 */ }
  }
  return out;
}

/** 고객사 기본 단가표(CX-140)의 공개 링크. 읽기 전용(주문 권한 없음). */
async function defaultSheet(companyId: string): Promise<RelationDocument[]> {
  const overview = await companyLinkOverview(companyId);
  const link = overview.links.find(item => item.isDefault && Date.parse(item.expiresAt) > Date.now());
  if (!link) return [];
  const versions = await supabaseRequest<Version[]>(
    `pricing_document_versions?company_id=eq.${q(companyId)}&document_id=eq.${q(link.documentId)}&published_at=not.is.null&select=id,document_id,content&order=version.desc&limit=1`);
  const content = versions[0]?.content;
  if (!content || content.kind !== "sheet" || content.validUntil < today()) return [];
  return [{ title: content.title, kind: "sheet", href: link.viewerPath, canOrder: false, validUntil: content.validUntil,
    ...(Array.isArray(content.lines) ? { itemCount: content.lines.filter(line => line.visible).length } : {}) }];
}

async function previewProducts(companyId: string, storeAccountId: string, authUserId: string): Promise<RelationProduct[]> {
  const rows = await supabaseRequest<Array<{ product_name: string; sales_spec: string | null; sales_unit: string | null; large_category: string | null }>>(
    "rpc/store_member_catalog_v2", { method: "POST", body: JSON.stringify({ p_account: storeAccountId, p_user: authUserId, p_date: today(), p_company: companyId, p_page: 1 }) });
  // 가격·원가 열은 읽지도 넘기지도 않는다.
  return rows.slice(0, 100).map(row => ({ name: row.product_name, spec: row.sales_spec ?? "", unit: row.sales_unit ?? "", category: row.large_category ?? "" }));
}

/**
 * 한 매장 계정(고객사별)의 관계 기준 홈 구성. 어떤 단계가 실패해도 기존 홈은 그대로 열리도록 호출부가 잡는다.
 * 확인된 매장: 전체 상품 링크 1개 보장 + 받은 문서 합치기. 확인 전: 가격 없는 상품 목록만.
 */
export async function readStoreRelationHome(input: { companyId: string; storeAccountId: string; customerId: string; authUserId: string; knownVersionIds: Set<string> }) {
  const { companyId, storeAccountId, customerId } = input;
  const confirmed = await storePriceConfirmed(companyId, storeAccountId);
  const documents: RelationDocument[] = [
    ...await readStorePortalSourceDocuments(companyId, storeAccountId, customerId, true),
    ...await defaultSheet(companyId).catch(() => []),
  ];
  if (!confirmed) {
    const products = await previewProducts(companyId, storeAccountId, input.authUserId).catch(() => []);
    return { relation: { confirmed: false, products } satisfies StoreRelation, catalog: null, documents };
  }
  const catalog = await ensureStoreCatalogLink(companyId, customerId).catch(() => null);
  documents.push(...await sentDocuments(companyId, customerId, input.knownVersionIds).catch(() => []));
  return { relation: { confirmed: true } satisfies StoreRelation, catalog, documents };
}
