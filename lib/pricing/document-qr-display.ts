import type { DocumentScope } from "@/application/pricing/documents";
import { documentQrDisplay, type DocumentContent, type DocumentQrDisplay } from "@/domains/pricing/document";
import { DocumentSendError } from "@/domains/pricing/document-send";
import { supabaseRequest } from "@/lib/store";

type Row = { id: string; revision: number; kind: string; owner_key: string; content: DocumentContent; archived_at?: string | null };
function path(scope: DocumentScope, id: string) {
  return `pricing_documents?company_id=eq.${encodeURIComponent(scope.companyId)}&id=eq.${encodeURIComponent(id)}&or=(kind.eq.sheet,owner_key.eq.${encodeURIComponent(scope.actor)})`;
}
async function scopedDocument(scope: DocumentScope, id: string) {
  if (!scope.qrDisplayEnabled) throw new DocumentSendError("QR 표시 설정을 사용할 수 없습니다.", 404);
  try {
    const contract = await supabaseRequest<number>("rpc/pricing_document_qr_display_contract_v1", { method: "POST", body: "{}" });
    if (contract !== 1) throw new Error("qr_contract_required");
  } catch { throw new DocumentSendError("QR 표시 설정을 준비 중입니다. 관리자에게 확인해 주세요.", 503); }
  // One scoped row; * permits old schemas without archived_at while honoring it when present.
  const rows = await supabaseRequest<Row[]>(path(scope, id) + "&select=*&limit=1");
  const row = rows[0];
  if (!row || row.archived_at || row.kind !== "sheet" && row.owner_key !== scope.actor)
    throw new DocumentSendError("문서를 찾지 못했습니다.", 404);
  return row;
}
export async function readDocumentQrDisplay(scope: DocumentScope, id: string) {
  const row = await scopedDocument(scope, id);
  return { id: row.id, revision: row.revision, settings: documentQrDisplay(row.content.display?.qr) };
}
export async function saveDocumentQrDisplay(scope: DocumentScope, input: { id: string; expected: number; settings: DocumentQrDisplay }) {
  const row = await scopedDocument(scope, input.id);
  if (row.kind === "sheet" && !scope.manager) throw new DocumentSendError("표시 설정을 수정할 문서를 찾지 못했습니다.", 404);
  if (row.revision !== input.expected) throw new DocumentSendError("다른 화면에서 문서가 바뀌었습니다. 미리보기를 다시 열어 주세요.", 409);
  // Normal save can replace promotion prices. Preserve the stored content unchanged except display.qr.
  // The revision predicate makes this replacement a compare-and-swap with concurrent draft saves.
  const rows = await supabaseRequest<Array<{ id: string; revision: number }>>(
    path(scope, input.id) + `&revision=eq.${input.expected}&select=id,revision${row.archived_at === null ? "&archived_at=is.null" : ""}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({
      content: { ...row.content, display: { ...row.content.display, qr: input.settings } },
      revision: input.expected + 1, updated_at: new Date().toISOString(),
    }) });
  if (rows.length !== 1) throw new DocumentSendError("다른 화면에서 문서가 바뀌었습니다. 미리보기를 다시 열어 주세요.", 409);
  return { id: row.id, previousRevision: input.expected, revision: rows[0].revision, settings: input.settings };
}
