import { randomUUID } from "crypto";
import type { DocumentScope } from "../../application/pricing/documents";
import { DocumentSendError, type DocumentSendInput, type DocumentSendResult } from "../../domains/pricing/document-send";
import { parseDocument, isId, koreaDay, withLivePromotions, type DocumentContent, type DocumentVersion } from "../../domains/pricing/document";
import { publicDocumentOutput, type PrepareDocumentShare, type PreparedDocumentShare } from "../../domains/pricing/document-share";
import { supabaseRequest } from "../store";
import { documentSharingEnabled } from "./document-share-feature";
import { equalShareHash, issueDocumentShareToken, shareRequesterHash, verifyDocumentShareToken } from "./document-share-token";

type ShareRow = {
  id: string; company_id: string; document_id: string; document_version_id: string; lead_id: string;
  idempotency_key: string; created_by_key: string; token_nonce: string; token_hash: string;
  ttl_days: number; created_at: string; expires_at: string; revoked_at: string | null; send_id: string | null;
};
const shareFields = "id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash,ttl_days,created_at,expires_at,revoked_at,send_id";
function missing(): never { throw new DocumentSendError("공유 문서를 사용할 수 없습니다.", 404); }
function enabled(scope: DocumentScope) {
  if (!scope.sharingEnabled || !documentSharingEnabled(scope.companyId)) missing();
}
function path(table: string, company: string, query: string) {
  return `${table}?company_id=eq.${encodeURIComponent(company)}&${query}`;
}
async function link(scope: DocumentScope, id: string) {
  enabled(scope);
  const rows = await supabaseRequest<ShareRow[]>(path("pricing_document_share_links", scope.companyId, `id=eq.${id}&select=${shareFields}&limit=1`));
  const row = rows[0];
  if (!row || row.created_by_key !== scope.actor) missing();
  return row;
}
function publicUrl(row: ShareRow) {
  const issued = issueDocumentShareToken(row.id, row.token_nonce);
  if (!equalShareHash(issued.hash, row.token_hash))
    throw new DocumentSendError("링크 설정이 변경됐습니다. 기존 링크를 회수하고 새 링크를 준비해 주세요.", 409);
  return `/pricing-document#${issued.token}`;
}
async function published(company: string, versionId: string, actor?: string): Promise<DocumentVersion> {
  const versions = await supabaseRequest<Array<{ id: string; document_id: string; version: number; revision: number; content: DocumentContent; published_at: string }>>(
    path("pricing_document_versions", company, `id=eq.${versionId}&select=id,document_id,version,revision,content,published_at&limit=1`));
  const v = versions[0];
  if (!v || !v.published_at) missing();
  // Reading the row as a whole lets an optional archive column remain backward compatible.
  const docs = await supabaseRequest<Array<{ id: string; kind: string; owner_key: string; archived_at?: string | null }>>(
    path("pricing_documents", company, `id=eq.${v.document_id}&select=*&limit=1`));
  const d = docs[0];
  if (!d || d.archived_at || (d.kind !== "sheet" && d.kind !== "quote") || (actor && d.kind === "quote" && d.owner_key !== actor)) missing();
  const content = parseDocument(v.content);
  if (content.kind !== d.kind) missing();
  return { id: v.id, documentId: v.document_id, version: v.version, revision: v.revision,
    publishedAt: v.published_at, content, unavailablePromotions: [] };
}
async function assertLead(company: string, leadId: string) {
  const rows = await supabaseRequest<Array<{ id: string }>>(path("business_permit_leads", company,
    `id=eq.${leadId}&merged_into_lead_id=is.null&select=id&limit=1`));
  if (!rows.length) missing();
}
export async function limitDocumentShare(company: string, identity: string, action: "prepare" | "read", id: string) {
  const result = await supabaseRequest<string>("rpc/pricing_s2_public_request_guard", { method: "POST", body: JSON.stringify({
    p_company_id: company, p_route_key: `lead-document-${action}-v1`, p_requester_hash: shareRequesterHash(identity),
    p_payload: { shareLinkId: id }, p_limit: action === "prepare" ? 10 : 20,
  }) });
  if (result === "rate_limited") throw new DocumentSendError("요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  if (result !== "allowed") throw new DocumentSendError("요청을 확인하지 못했습니다. 다시 시도해 주세요.", 503);
}
export async function prepareDocumentShare(scope: DocumentScope, input: PrepareDocumentShare): Promise<PreparedDocumentShare> {
  enabled(scope);
  const id = randomUUID();
  await limitDocumentShare(scope.companyId, `actor:${scope.actor}`, "prepare", id);
  const keyPath = path("pricing_document_share_links", scope.companyId, `idempotency_key=eq.${input.idempotencyKey}&select=${shareFields}&limit=1`);
  const existing = (await supabaseRequest<ShareRow[]>(keyPath))[0];
  if (existing && (existing.document_id !== input.documentId || existing.document_version_id !== input.documentVersionId || existing.lead_id !== input.leadId ||
    existing.ttl_days !== input.ttlDays || existing.created_by_key !== scope.actor))
    throw new DocumentSendError("같은 재시도 키에 다른 공유 요청이 있습니다. 기존 요청을 확인해 주세요.", 409);
  const version = await published(scope.companyId, input.documentVersionId, scope.actor);
  if (version.documentId !== input.documentId) throw new DocumentSendError("선택한 문서와 게시 버전이 다릅니다. 다시 확인해 주세요.", 409);
  if (!existing && version.content.validUntil < koreaDay()) missing();
  await assertLead(scope.companyId, input.leadId);
  const issued = issueDocumentShareToken(id);
  const expected = { company_id: scope.companyId, document_id: version.documentId, document_version_id: version.id,
    lead_id: input.leadId, idempotency_key: input.idempotencyKey, created_by_key: scope.actor, ttl_days: input.ttlDays };
  if (!existing) await supabaseRequest("pricing_document_share_links?on_conflict=company_id,idempotency_key", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ ...expected, id, token_nonce: issued.nonce, token_hash: issued.hash }),
  });
  const saved = existing || (await supabaseRequest<ShareRow[]>(keyPath))[0];
  if (!saved) throw new Error("Share preparation unconfirmed");
  if (Object.entries(expected).some(([key, value]) => saved[key as keyof ShareRow] !== value))
    throw new DocumentSendError("같은 재시도 키에 다른 공유 요청이 있습니다. 기존 요청을 확인해 주세요.", 409);
  if (saved.revoked_at || Date.parse(saved.expires_at) <= Date.now()) missing();
  return { shareLinkId: saved.id, sendId: null, documentId: saved.document_id, documentVersionId: saved.document_version_id,
    publicUrl: publicUrl(saved), expiresAt: saved.expires_at, deliveryRecorded: false };
}
export async function revokeDocumentShare(scope: DocumentScope, id: string) {
  const row = await link(scope, id);
  await supabaseRequest(path("pricing_document_share_links", scope.companyId, `id=eq.${id}&revoked_at=is.null`), {
    method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  const confirmed = await link(scope, id);
  if (!confirmed.revoked_at) throw new Error("Share revocation unconfirmed");
  return { shareLinkId: row.id, revoked: true };
}
export async function validateShareDelivery(scope: DocumentScope, input: DocumentSendInput) {
  const row = await link(scope, input.shareLinkId!);
  if (!row.send_id && (row.revoked_at || Date.parse(row.expires_at) <= Date.now())) missing();
  if (row.document_version_id !== input.documentVersionId || row.lead_id !== input.leadId ||
    row.idempotency_key !== input.idempotencyKey || input.customerId !== null)
    throw new DocumentSendError("준비한 링크와 실제 전달 내용을 확인해 주세요.", 409);
  const version = await published(scope.companyId, input.documentVersionId, scope.actor);
  if (version.documentId !== row.document_id) missing();
  await assertLead(scope.companyId, row.lead_id);
  publicUrl(row); // Key rotation must fail before creating a delivery record.
  return row;
}
export async function recordSharedDocumentDelivery(scope: DocumentScope, input: DocumentSendInput): Promise<DocumentSendResult> {
  const row = await validateShareDelivery(scope, input);
  let result: DocumentSendResult;
  try {
    result = await supabaseRequest<DocumentSendResult>("rpc/record_pricing_lead_share_delivery", { method: "POST", body: JSON.stringify({
      p_company_id: scope.companyId, p_actor: scope.actor, p_share_link_id: row.id, p_document_id: row.document_id,
      p_document_version_id: row.document_version_id, p_lead_id: row.lead_id, p_idempotency_key: input.idempotencyKey,
      p_template_id: input.templateId, p_channel: input.channel, p_actor_name: scope.actorName || "이름 미등록 직원",
    }) });
  } catch (error) {
    if (error instanceof Error && /share_delivery_conflict|share_action_conflict/.test(error.message))
      throw new DocumentSendError("같은 재시도 키에 다른 전달 내용이 있습니다. 기존 요청을 확인해 주세요.", 409);
    if (error instanceof Error && /share_document_not_found|share_lead_not_found|share_link_unavailable/.test(error.message)) missing();
    throw error;
  }
  if (!isId(result.sendId) || result.leadActionId !== result.sendId || result.documentId !== row.document_id || result.documentVersionId !== row.document_version_id)
    throw new Error("Atomic delivery/contact record unconfirmed");
  return { sendId: result.sendId, leadActionId: result.leadActionId, documentId: result.documentId,
    documentVersionId: result.documentVersionId, publicUrl: publicUrl(row) };
}
export async function readPublicDocument(token: string, requester: string) {
  if (!documentSharingEnabled()) missing();
  const decoded = verifyDocumentShareToken(token);
  if (!decoded) missing();
  const rows = await supabaseRequest<ShareRow[]>(`pricing_document_share_links?id=eq.${decoded.id}&token_hash=eq.${decoded.hash}&select=${shareFields}&limit=1`);
  const row = rows[0];
  if (!row || !documentSharingEnabled(row.company_id) || row.revoked_at || !equalShareHash(row.token_hash, decoded.hash) ||
    row.token_nonce !== decoded.nonce || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) missing();
  await limitDocumentShare(row.company_id, requester, "read", row.id);
  await assertLead(row.company_id, row.lead_id);
  const version = await published(row.company_id, row.document_version_id, row.created_by_key);
  if (version.documentId !== row.document_id) missing();
  const ids = Array.from(new Set(version.content.lines.flatMap(l => l.promotionId ? [l.promotionId] : [])));
  const promotions: Array<{ id: string; stock: number | null; startsOn: string; endsOn: string }> = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const current = await supabaseRequest<Array<{ id: string; stock: number | null; starts_on: string; ends_on: string }>>(
      path("pricing_promotions", row.company_id, `id=in.(${ids.slice(offset, offset + 100).join(",")})&select=id,stock,starts_on,ends_on&limit=100`));
    promotions.push(...current.map(p => ({ id: p.id, stock: p.stock, startsOn: p.starts_on, endsOn: p.ends_on })));
  }
  const output = publicDocumentOutput(withLivePromotions(version, promotions));
  if (row.send_id) await supabaseRequest(path("pricing_document_sends", row.company_id,
    `id=eq.${row.send_id}&document_version_id=eq.${row.document_version_id}&lead_id=eq.${row.lead_id}&acceptance_status=eq.sent&viewed_at=is.null`), {
    method: "PATCH", body: JSON.stringify({ viewed_at: new Date().toISOString(), acceptance_status: "viewed" }),
  });
  return { document: output, expiresAt: row.expires_at };
}
