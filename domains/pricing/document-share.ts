import { DocumentSendError } from "./document-send";
import { documentOutput, isId, object, type DocumentVersion } from "./document";

export type PrepareDocumentShare = { documentId: string; documentVersionId: string; leadId: string | null; idempotencyKey: string; ttlDays: number };
export type PreparedDocumentShare = { shareLinkId: string; sendId: null; documentId: string; documentVersionId: string; publicUrl: string; expiresAt: string; deliveryRecorded: false };
export function parseDocumentShare(input: unknown): PrepareDocumentShare {
  const b = object(input), ttlDays = b.ttlDays ?? 14;
  if (!isId(b.documentId) || !isId(b.documentVersionId) || (b.leadId != null && !isId(b.leadId)) || !isId(b.idempotencyKey) ||
    !Number.isInteger(ttlDays) || Number(ttlDays) < 1 || Number(ttlDays) > 30)
    throw new DocumentSendError("게시 버전·재시도 키와 링크 기간(1~30일)을 확인해 주세요.", 400);
  return { documentId: b.documentId.toLowerCase(), documentVersionId: b.documentVersionId.toLowerCase(), leadId: typeof b.leadId === "string" ? b.leadId.toLowerCase() : null, idempotencyKey: b.idempotencyKey.toLowerCase(), ttlDays: Number(ttlDays) };
}

/** Public sales output only. Never serialize a published row, recipient or arbitrary info. */
export function publicDocumentOutput(version: DocumentVersion, day?: string) {
  const d = documentOutput(version, day);
  return {
    title: d.title, companyName: d.companyName, contact: "", recipient: "", footer: "",
    validUntil: d.validUntil, version: d.version, publishedAt: d.publishedAt, expired: d.expired,
    theme: d.theme, kind: d.kind, layout: d.layout,
    display: { columns: d.display.columns, promoLayout: d.display.promoLayout, info: [], productWidth: d.display.productWidth, priceIncludesTax: d.display.priceIncludesTax },
    lines: d.lines.map(l => ({ displayName: l.displayName, brand: l.brand, spec: l.spec, unit: l.unit,
      price: l.price, taxType: l.taxType, badge: l.badge, endsOn: l.endsOn, remaining: l.remaining })),
  };
}
export type PublicDocumentOutput = ReturnType<typeof publicDocumentOutput>;
