import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { isId } from "../../domains/pricing/document";

function secret() {
  const value = process.env.LEAD_DOCUMENT_LINK_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error("Document sharing secret unavailable");
  return value;
}
function signature(id: string, nonce: string) {
  return createHmac("sha256", secret()).update(`lead-document-link-v1:${id}:${nonce}`).digest("hex");
}
export function equalShareHash(a: string, b: string) {
  return /^[0-9a-f]{64}$/.test(a) && /^[0-9a-f]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
export function issueDocumentShareToken(id: string, nonce = randomBytes(16).toString("hex")) {
  if (!isId(id) || !/^[0-9a-f]{32}$/.test(nonce)) throw new Error("Invalid share identity");
  const token = `${id}.${nonce}.${signature(id, nonce)}`;
  return { token, nonce, hash: createHash("sha256").update(token).digest("hex") };
}
export function verifyDocumentShareToken(token: string) {
  const parts = /^([0-9a-f-]{36})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(token);
  if (!parts || !isId(parts[1]) || !equalShareHash(signature(parts[1], parts[2]), parts[3])) return null;
  return { id: parts[1], nonce: parts[2], hash: createHash("sha256").update(token).digest("hex") };
}
export function shareRequesterHash(identity: string) {
  return createHmac("sha256", secret()).update(`lead-document-requester-v1:${identity}`).digest("hex");
}
