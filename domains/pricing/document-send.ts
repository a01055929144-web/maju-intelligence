import { field, isId } from "./document";

export class DocumentSendError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 | 429 | 503) { super(message); }
}
export type DocumentSendInput = {
  documentVersionId: string; leadId: string | null; customerId: string | null;
  templateId: string; channel: "link" | "kakao" | "qr" | "print" | "staff";
  idempotencyKey: string;
  shareLinkId?: string;
};
export type DocumentSendResult = {
  sendId: string; documentId: string; documentVersionId: string; publicUrl: string | null;
};

export function parseDocumentSend(body: Record<string, unknown>): DocumentSendInput {
  if (body.delivered !== true) throw new DocumentSendError("실제로 전달한 뒤 전달 완료를 확인해 주세요.", 400);
  const { documentVersionId, leadId, customerId, idempotencyKey, channel } = body;
  if (!isId(documentVersionId) || !isId(idempotencyKey) ||
    (leadId != null && !isId(leadId)) || (customerId != null && !isId(customerId)) ||
    (leadId != null) === (customerId != null)) throw new DocumentSendError("게시 버전과 전달 대상 하나, 재시도 키를 확인해 주세요.", 400);
  if (channel !== "link" && channel !== "kakao" && channel !== "qr" && channel !== "print" && channel !== "staff")
    throw new DocumentSendError("전달 경로를 확인해 주세요.", 400);
  let templateId: string;
  if (body.shareLinkId !== undefined && (!isId(body.shareLinkId) || !leadId || customerId != null))
    throw new DocumentSendError("리드에게 준비한 공유 링크를 확인해 주세요.", 400);
  try { templateId = field(body.templateId, 100, true); }
  catch { throw new DocumentSendError("실제 사용한 템플릿을 확인해 주세요.", 400); }
  return { documentVersionId: documentVersionId.toLowerCase(), idempotencyKey: idempotencyKey.toLowerCase(),
    leadId: typeof leadId === "string" ? leadId.toLowerCase() : null,
    customerId: typeof customerId === "string" ? customerId.toLowerCase() : null, templateId, channel,
    ...(typeof body.shareLinkId === "string" ? { shareLinkId: body.shareLinkId.toLowerCase() } : {}) };
}
