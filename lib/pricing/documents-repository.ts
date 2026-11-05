import { getSupabaseConfig, supabaseRequest } from "../store";
import type { DocumentScope, PricingDocumentsRepository } from "../../application/pricing/documents";
import { withDocumentRecalculations } from "./document-recalculation";
import { catalogDisplaySpec, isId, koreaDay, type DocumentDraft, type DocumentVersion } from "../../domains/pricing/document";

type CatalogResult = { items: Array<{ id: string; spec: string }> };
type DocumentList = { items: DocumentDraft[]; total: number };
type DocumentRow = { id: string; revision: number; content: DocumentDraft["content"]; updated_at: string };
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
  const input = payload as { page?: unknown; search?: unknown };
  const page = Number.isSafeInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 100) : "";
  const params = new URLSearchParams({
    select: "id,revision,content,updated_at",
    company_id: `eq.${scope.companyId}`,
    order: "updated_at.desc,id",
    limit: "50",
    offset: String((page - 1) * 50),
  });
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
  return { items: rows.map(row => ({ id: row.id, revision: row.revision, content: row.content, updatedAt: row.updated_at })), total };
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
export const pricingDocumentsRepository: PricingDocumentsRepository = {
  async request<T>(scope: DocumentScope, action: string, payload: object): Promise<T> {
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
