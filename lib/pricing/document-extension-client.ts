import { parseDocument, type DocumentContent, type DocumentVersion, type CatalogChoice } from "@/domains/pricing/document";
import { documentRequest } from "./document-client";

export type ExtensionMode = "keep" | "latest";
export type ExtensionReview = {
  documentId: string;
  revision: number;
  mode: ExtensionMode;
  token: string;
  content: DocumentContent;
  summary: { unchanged: number; changed: number; added: number; removed: number };
  loweredProfitCount: number;
  minimumProfitRate: number | null;
  lines: { key: string; name: string; source: "catalog" | "base" | "promotion"; promiseUntil: string | null;
    before: number | null; calculated: number; price: number; difference: number; profitRate: number | null; belowThreshold: boolean; manual: boolean }[];
};

/** CX-120 integration boundary. Never substitute the old company catalog or calculate prices in the browser. */
export async function reviewDocumentExtension(companyId: string, input: {
  id: string; expected: number; mode: ExtensionMode; validUntil: string; stage: "start" | "review"; content?: DocumentContent;
}): Promise<ExtensionReview> {
  const { result } = await documentRequest<ExtensionReview>(companyId, "extension-review", input, true);
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  if (!result || result.documentId !== input.id || result.revision !== input.expected || result.mode !== input.mode ||
    typeof result.token !== "string" || !result.token || !result.summary ||
    ![result.summary.unchanged, result.summary.changed, result.summary.added, result.summary.removed].every(value => Number.isSafeInteger(value) && value >= 0) ||
    !Number.isSafeInteger(result.loweredProfitCount) || result.loweredProfitCount < 0 ||
    !(result.minimumProfitRate === null || finite(result.minimumProfitRate)) || !Array.isArray(result.lines) ||
    result.lines.some(line => !line || typeof line.key !== "string" || typeof line.name !== "string" ||
      !["catalog", "base", "promotion"].includes(line.source) || !(line.promiseUntil === null || typeof line.promiseUntil === "string") ||
      !(line.before === null || finite(line.before)) || !finite(line.calculated) || !finite(line.price) || !finite(line.difference) ||
      !(line.profitRate === null || finite(line.profitRate)) || typeof line.manual !== "boolean" || typeof line.belowThreshold !== "boolean"))
    throw new Error("연장 가격 확인 응답을 확인하지 못했습니다. 다시 시도해 주세요.");
  const content = parseDocument(result.content);
  if (content.validUntil !== input.validUntil || (input.stage === "review" && JSON.stringify(content) !== JSON.stringify(parseDocument(input.content))))
    throw new Error("문서 변경과 가격 확인 결과가 일치하지 않습니다. 다시 확인해 주세요.");
  return { ...result, content };
}

export async function publishDocumentExtension(companyId: string, input: {
  id: string; expected: number; mode: ExtensionMode; token: string; idempotencyKey: string;
}) {
  const { result } = await documentRequest<DocumentVersion>(companyId, "extension-publish", input, true);
  if (!result || result.documentId !== input.id || !Number.isSafeInteger(result.version) || result.version < 1)
    throw new Error("연장 게시본을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
  return result;
}

/** Ordinary catalog is used only to find IDs; all returned prices come from the extension POST. */
export async function readDocumentExtensionCatalog(companyId: string, scope: { id: string; expected: number; mode: ExtensionMode }, lookup: Record<string, unknown> = {}) {
  const identified = Array.isArray(lookup.productIds)
    ? { items: lookup.productIds.map(id => ({ id: String(id) })), total: lookup.productIds.length }
    : (await documentRequest<{ items: { id: string }[]; total: number }>(companyId, "catalog", lookup)).result;
  const productIds = identified.items.map(item => item.id);
  if (!productIds.length) return { items: [], total: identified.total };
  const { result } = await documentRequest<{ items: (CatalogChoice & { source: string })[] }>(companyId, "extension-catalog", { ...scope, productIds }, true);
  if (!result || !Array.isArray(result.items) || result.items.some(item => !productIds.includes(item.id) ||
    !Number.isSafeInteger(item.price) || item.price < 0 || !["catalog", "base"].includes(item.source)))
    throw new Error("연장할 품목의 서버 가격을 확인하지 못했습니다. 다시 시도해 주세요.");
  return { items: result.items.map(({ id, name, displayName, brand, spec, unit, price, taxType }) =>
    ({ id, name, displayName, brand, spec, unit, price, taxType })), total: identified.total };
}
