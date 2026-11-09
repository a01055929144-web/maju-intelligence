import { DocumentSendError } from "./document-send";
import { documentOutput, isId, object, koreaDay, type DocumentVersion } from "./document";

export type PrepareDocumentShare = { documentId: string; documentVersionId: string; leadId: string | null; idempotencyKey: string; ttlDays: number | null };
export type PreparedDocumentShare = { shareLinkId: string; sendId: null; documentId: string; documentVersionId: string; publicUrl: string; expiresAt: string; deliveryRecorded: false };
export function parseDocumentShare(input: unknown): PrepareDocumentShare {
  const b = object(input), general = b.leadId == null, ttlDays = general ? null : b.ttlDays ?? 14;
  if (!isId(b.documentId) || !isId(b.documentVersionId) || (b.leadId != null && !isId(b.leadId)) || !isId(b.idempotencyKey) ||
    (general ? b.ttlDays != null : !Number.isInteger(ttlDays) || Number(ttlDays) < 1 || Number(ttlDays) > 30))
    throw new DocumentSendError("게시 버전·재시도 키를 확인해 주세요. 공개 QR 기간은 문서 기준으로 자동 설정하며 리드 링크만 1~30일을 지정합니다.", 400);
  return { documentId: b.documentId.toLowerCase(), documentVersionId: b.documentVersionId.toLowerCase(), leadId: typeof b.leadId === "string" ? b.leadId.toLowerCase() : null, idempotencyKey: b.idempotencyKey.toLowerCase(), ttlDays: general ? null : Number(ttlDays) };
}

/** The date's KST 24:00 is the same instant as 15:00 UTC. */
export function documentOrderExpiry(validUntil: string) {
  const cutoff = Date.parse(`${validUntil}T15:00:00.000Z`);
  if (!Number.isFinite(cutoff)) throw new DocumentSendError("문서의 가격 유효기간을 확인해 주세요.", 400);
  return new Date(cutoff).toISOString();
}
/** Public printed QR remains readable for 365 days after the KST price/order cutoff. */
export function publicDocumentLinkExpiry(validUntil: string) {
  return new Date(Date.parse(documentOrderExpiry(validUntil)) + 365 * 86400000).toISOString();
}
export function documentLinkLastDay(expiresAt: string) {
  return koreaDay(new Date(Date.parse(expiresAt) - 1));
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
