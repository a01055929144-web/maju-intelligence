import { getSupabaseConfig, supabaseRequest } from "../store";
import type { DocumentScope, PricingDocumentsRepository } from "../../application/pricing/documents";
import { withDocumentRecalculations } from "./document-recalculation";
import { catalogDisplaySpec, isId, koreaDay, type DocumentDraft, type DocumentVersion } from "../../domains/pricing/document";
import { DocumentSendError, type DocumentSendInput, type DocumentSendResult } from "../../domains/pricing/document-send";
import type { PrepareDocumentShare } from "../../domains/pricing/document-share";
import { prepareDocumentShare, revokeDocumentShare, recordSharedDocumentDelivery } from "./document-share";

type CatalogResult = { items: Array<{ id: string; spec: string }> };
type DocumentList = { items: DocumentDraft[]; total: number };
type DocumentRow = { id: string; revision: number; content: DocumentDraft["content"]; updated_at: string; archived_at?: string | null };
type VersionRow = { id: string; document_id: string; version: number; revision: number; content: DocumentDraft["content"]; published_at: string };
type PromotionRow = { id: string; stock: number | null; starts_on: string; ends_on: string };

async function companyGet<T>(path: string, config: NonNullable<ReturnType<typeof getSupabaseConfig>>): Promise<T> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Pricing document read failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function listCompanyDocuments(scope: DocumentScope, payload: object): Promise<DocumentList> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const input = payload as { page?: unknown; search?: unknown; archived?: unknown };
  const page = Number.isSafeInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 100) : "";
  const params = new URLSearchParams({
    select: `id,revision,content,updated_at${scope.archiveEnabled ? ",archived_at" : ""}`,
    company_id: `eq.${scope.companyId}`,
    order: "updated_at.desc,id",
    limit: "50",
    offset: String((page - 1) * 50),
  });
  if (scope.archiveEnabled) params.set("archived_at", input.archived === true ? "not.is.null" : "is.null");
  if (search) params.set("content->>title", `ilike.*${search}*`);
  const response = await fetch(`${config.url}/rest/v1/pricing_documents?${params}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Prefer: "count=exact",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Pricing document list failed: ${response.status}`);
  const rows = await response.json() as DocumentRow[];
  const total = Number(response.headers.get("content-range")?.split("/")[1]);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("문서 전체 건수를 확인하지 못했습니다.");
  return { items: rows.map(row => ({ id: row.id, revision: row.revision, content: row.content, updatedAt: row.updated_at, ...(scope.archiveEnabled ? { archivedAt: row.archived_at ?? null } : {}) })), total };
}

async function readCompanyVersions(scope: DocumentScope, payload: object): Promise<DocumentVersion[]> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const input = payload as { id?: unknown; page?: unknown };
  if (!isId(input.id)) throw new Error("Document not found");
  const company = encodeURIComponent(scope.companyId), id = encodeURIComponent(input.id);
  const document = await companyGet<Array<{ id: string }>>(`pricing_documents?company_id=eq.${company}&id=eq.${id}&select=id&limit=1`, config);
  if (!document.length) throw new Error("Document not found");
  const page = Number.isSafeInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
  const rows = await companyGet<VersionRow[]>(`pricing_document_versions?company_id=eq.${company}&document_id=eq.${id}&select=id,document_id,version,revision,content,published_at&order=version.desc&limit=50&offset=${(page - 1) * 50}`, config);
  const promotionIds = Array.from(new Set(rows.flatMap(row => row.content.lines.map(line => line.promotionId).filter(isId))));
  const promotions: PromotionRow[] = [];
  for (let offset = 0; offset < promotionIds.length; offset += 100) promotions.push(...await companyGet<PromotionRow[]>(`pricing_promotions?company_id=eq.${company}&id=in.(${promotionIds.slice(offset, offset + 100).map(encodeURIComponent).join(",")})&select=id,stock,starts_on,ends_on&limit=100`, config));
  const current = new Map(promotions.map(promotion => [promotion.id, promotion]));
  const today = koreaDay();
  return rows.map(row => {
    const ids = row.content.lines.map(line => line.promotionId).filter(isId);
    return {
      id: row.id,
      documentId: row.document_id,
      version: row.version,
      revision: row.revision,
      content: row.content,
      publishedAt: row.published_at,
      promotionStock: Object.fromEntries(ids.flatMap(id => current.has(id) ? [[id, current.get(id)!.stock]] : [])),
      unavailablePromotions: ids.filter(id => { const promotion = current.get(id); return !promotion || today < promotion.starts_on || today > promotion.ends_on || promotion.stock === 0; }),
    };
  });
}

async function withCatalogSpecs(companyId: string, result: CatalogResult): Promise<CatalogResult> {
  const missing = result.items.filter((item) => !(item.spec || "").trim() && /^[0-9a-f-]{36}$/i.test(item.id));
  if (!missing.length) return result;
  const ids = missing.map((item) => item.id).join(",");
  const rows = await supabaseRequest<Array<{ id: string; sales_spec: string | null; spec_value: number | null; spec_unit: string | null }>>(
    `product_catalog?select=id,sales_spec,spec_value,spec_unit&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${ids})&limit=100`
  );
  const specs = new Map(rows.map((row) => [row.id, catalogDisplaySpec(row)]));
  return { ...result, items: result.items.map((item) => ({ ...item, spec: (item.spec || "").trim() || specs.get(item.id) || "" })) };
}
async function recordDocumentSend(scope: DocumentScope, input: DocumentSendInput): Promise<DocumentSendResult> {
  const company = encodeURIComponent(scope.companyId);
  const versions = await supabaseRequest<Array<{ id: string; document_id: string; content: { layout: string } }>>(
    `pricing_document_versions?company_id=eq.${company}&id=eq.${input.documentVersionId}&select=id,document_id,content&limit=1`);
  const version = versions[0];
  if (!version) throw new DocumentSendError("게시 문서를 찾지 못했습니다.", 404);
  const documents = await supabaseRequest<Array<{ id: string; kind: string; owner_key: string }>>(
    `pricing_documents?company_id=eq.${company}&id=eq.${version.document_id}&select=id,kind,owner_key&limit=1`);
  const document = documents[0];
  if (!document || (document.kind !== "sheet" && document.owner_key !== scope.actor))
    throw new DocumentSendError("게시 문서를 찾지 못했습니다.", 404);
  const targetTable = input.leadId ? "business_permit_leads" : "normalized_customers";
  const targets = await supabaseRequest<Array<{ id: string }>>(
    `${targetTable}?company_id=eq.${company}&id=eq.${input.leadId ?? input.customerId}&select=id&limit=1`);
  if (!targets.length) throw new DocumentSendError("전달 대상을 찾지 못했습니다.", 404);
  const layout = version.content.layout;
  if (layout !== "auto" && layout !== "table" && layout !== "cards") throw new Error("Invalid published layout");
  const row = { company_id: scope.companyId, document_id: version.document_id, document_version_id: version.id,
    lead_id: input.leadId, customer_id: input.customerId, template_id: input.templateId, layout, channel: input.channel,
    idempotency_key: input.idempotencyKey, sent_by_key: scope.actor };
  const select = "id,company_id,document_id,document_version_id,lead_id,customer_id,template_id,layout,channel,idempotency_key,sent_by_key";
  // The existing unique key serializes concurrent retries; never overwrite a prior delivery record.
  await supabaseRequest(`pricing_document_sends?on_conflict=company_id,idempotency_key`, {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(row),
  });
  const rows = await supabaseRequest<Array<typeof row & { id: string }>>(
    `pricing_document_sends?company_id=eq.${company}&idempotency_key=eq.${input.idempotencyKey}&select=${select}&limit=1`);
  const saved = rows[0];
  if (!saved) throw new Error("Delivery record not confirmed");
  if (Object.entries(row).some(([key, value]) => saved[key as keyof typeof row] !== value))
    throw new DocumentSendError("같은 재시도 키에 다른 전달 내용이 있습니다. 기존 요청을 확인해 주세요.", 409);
  return { sendId: saved.id, documentId: saved.document_id, documentVersionId: saved.document_version_id, publicUrl: null };
}

export const pricingDocumentsRepository: PricingDocumentsRepository = {
  async request<T>(scope: DocumentScope, action: string, payload: object): Promise<T> {
    if (action === "prepare-share") return prepareDocumentShare(scope, payload as PrepareDocumentShare) as Promise<T>;
    if (action === "revoke-share") return revokeDocumentShare(scope, (payload as { shareLinkId: string }).shareLinkId) as Promise<T>;
    if (action === "record-send") {
      const input = payload as DocumentSendInput;
      if (input.shareLinkId) return recordSharedDocumentDelivery(scope, input) as Promise<T>;
      return recordDocumentSend(scope, input) as Promise<T>;
    }
    if (action === "archive") {
      if (!scope.archiveEnabled) throw new Error("문서 보관을 사용할 수 없습니다.");
      const input = payload as { id: string; expected: number; archived: boolean };
      return supabaseRequest<T>("rpc/set_pricing_document_archived", { method: "POST", body: JSON.stringify({ p_company: scope.companyId, p_actor: scope.actor, p_manager: scope.manager, p_document: input.id, p_expected: input.expected, p_archived: input.archived }) });
    }
    if (action === "list") return withDocumentRecalculations(scope.companyId, await listCompanyDocuments(scope, payload)) as Promise<T>;
    if (action === "versions") return readCompanyVersions(scope, payload) as Promise<T>;
    const result = await supabaseRequest<T>("rpc/pricing_p1", {
      method: "POST",
      body: JSON.stringify({
        p_company: scope.companyId,
        p_actor: scope.actor,
        p_manager: scope.manager,
        p_action: action,
        p_payload: payload,
      }),
    });
    if (action === "catalog") return withCatalogSpecs(scope.companyId, result as CatalogResult) as Promise<T>;
    return result;
  },
};
