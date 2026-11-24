import { createHash } from "crypto";
import { supabaseRequest } from "../store";
import { isId } from "../../domains/pricing/document";
import { listActivePublicLinks, preparePublicLinkAs, revokePublicLinkById } from "./document-share";

type DocRow = { id: string; content?: { title?: unknown } | null; updated_at: string; archived_at?: string | null };
type Version = { id: string; document_id: string; version: number };
const q = (id: string) => encodeURIComponent(id);

export function systemActor(company: string, who: string) {
  return createHash("sha256").update(`${company}:cx140:${who}`).digest("hex");
}
function titleOf(doc: DocRow) {
  const t = doc.content?.title;
  return typeof t === "string" && t.trim() ? t.trim().slice(0, 80) : "단가표";
}

/** 회사의 단가표(sheet) 후보: 보관되지 않았고 게시본이 있는 것, 최근 수정 순. */
async function sheets(company: string) {
  const docs = (await supabaseRequest<DocRow[]>(`pricing_documents?company_id=eq.${q(company)}&kind=eq.sheet&select=*&order=updated_at.desc&limit=50`)).filter(d => !d.archived_at);
  if (!docs.length) return [];
  const versions = await supabaseRequest<Version[]>(
    `pricing_document_versions?company_id=eq.${q(company)}&document_id=in.(${docs.map(d => d.id).join(",")})&published_at=not.is.null&select=id,document_id,version&order=version.desc&limit=1000`);
  const latest = new Map<string, string>();
  for (const v of versions) if (!latest.has(v.document_id)) latest.set(v.document_id, v.id);
  return docs.filter(d => latest.has(d.id)).map(d => ({ id: d.id, title: titleOf(d), latestVersionId: latest.get(d.id)! }));
}

async function pointer(company: string) {
  const rows = await supabaseRequest<Array<{ document_id: string }>>(`pricing_default_public_documents?company_id=eq.${q(company)}&select=document_id&limit=1`).catch(() => []);
  return rows[0]?.document_id ?? null;
}

/** 지정한 기본 단가표, 없으면 가장 최근 게시한 sheet. */
export async function companyLinkOverview(company: string) {
  const [docs, links, pinned] = await Promise.all([sheets(company), listActivePublicLinks(company), pointer(company)]);
  const defaultDoc = docs.find(d => d.id === pinned) ?? docs[0] ?? null;
  const title = new Map(docs.map(d => [d.id, d.title]));
  return {
    defaultDocumentId: defaultDoc?.id ?? null, defaultPinned: Boolean(pinned && defaultDoc?.id === pinned),
    documents: docs.map(d => ({ id: d.id, title: d.title })),
    links: links.map(l => ({ ...l, title: title.get(l.documentId) ?? "단가표", isDefault: l.documentId === defaultDoc?.id,
      duplicateCount: links.filter(o => o.documentId === l.documentId).length })),
  };
}

export async function setDefaultDocument(company: string, actor: string, documentId: string) {
  if (!isId(documentId) || !(await sheets(company)).some(d => d.id === documentId)) return false;
  await supabaseRequest("pricing_default_public_documents?on_conflict=company_id", { method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: company, document_id: documentId, set_by_key: actor, updated_at: new Date().toISOString() }) });
  return true;
}

/** 기본 단가표(또는 지정한 문서)의 공개 링크를 보장한다. 이미 있으면 그대로 돌려주므로 여러 번 불러도 1개. */
export async function ensureCompanyLink(company: string, actor: string, documentId?: string) {
  const docs = await sheets(company);
  const pinned = await pointer(company);
  const doc = docs.find(d => d.id === (documentId ?? pinned)) ?? (documentId ? null : docs[0]);
  if (!doc) return null;
  const link = await preparePublicLinkAs(company, actor, doc.id, doc.latestVersionId);
  return { shareLinkId: link.shareLinkId, documentId: doc.id, publicUrl: link.publicUrl, expiresAt: link.expiresAt };
}

export const revokeCompanyLink = revokePublicLinkById;
