import { validId } from "../../domains/pricing/purchase-cost-date";
export type PendingDateRequest = { digest: string; id: string };
const storageKey = (companyId: string) => `maju:purchase-date-pending:${companyId}`;
export function pendingDateRequest(companyId: string): PendingDateRequest | null {
  const raw = localStorage.getItem(storageKey(companyId));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("id" in value) || !("digest" in value)
    || !validId(value.id) || typeof value.digest !== "string" || !/^[0-9a-f]{64}$/.test(value.digest)) throw new Error("브라우저의 이전 저장 요청을 확인하지 못했습니다. 담당자에게 문의해 주세요.");
  return { id: value.id, digest: value.digest };
}
export function rememberDateRequest(companyId: string, pending: PendingDateRequest) {
  // Only a one-way request digest and random batch ID; no file contents, names or prices.
  localStorage.setItem(storageKey(companyId), JSON.stringify(pending));
}
export function forgetDateRequest(companyId: string) { localStorage.removeItem(storageKey(companyId)); }
export async function dateRequestDigest(payload: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
