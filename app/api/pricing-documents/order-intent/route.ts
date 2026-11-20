import { isIP } from "net";
import { connectPublicDocumentOrder } from "../../../../lib/pricing/public-document-order-connection";
import { randomUUID } from "crypto";
import { createPublicStoreOwnerOnboardingIntent } from "../../../../lib/store/07-store-owner-provisioning";
import { NextRequest, NextResponse } from "next/server";
import { DocumentSendError } from "../../../../domains/pricing/document-send";
import { publicDocumentOrderEntryEnabled, publicDocumentShoppingEnabled, publicDocumentSignupEnabled } from "../../../../lib/pricing/public-document-order-feature";
import { getPublicDocumentOrderContext } from "../../../../lib/pricing/document-share";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
function reply(status: number, message: string) { return NextResponse.json({ message }, { status, headers }); }
function unavailable() { return reply(404, "공유 문서를 사용할 수 없습니다."); }
async function smallBody(request: NextRequest): Promise<unknown> {
  if (request.headers.get("content-type")?.toLowerCase().split(";")[0].trim() !== "application/json") throw new Error("Invalid body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new Error("Body too large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function POST(request: NextRequest) {
  if (!publicDocumentOrderEntryEnabled()) return unavailable();
  try {
    const origin = new URL(request.headers.get("origin") || "invalid");
    if (!["http:", "https:"].includes(origin.protocol) || origin.host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase())
      return reply(403, "같은 화면에서 다시 시도해 주세요.");
  } catch { return reply(403, "같은 화면에서 다시 시도해 주세요."); }
  let token: string;
  const cart: Array<{ key: string; quantity: number }> = [];
  try {
    const body = await smallBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => key !== "token" && key !== "cart") || !("token" in body) ||
      typeof body.token !== "string" || body.token.length > 200 || !/^[\x21-\x7e]+$/.test(body.token) || request.nextUrl.search)
      return unavailable();
    token = body.token;
    if ("cart" in body) {
      if (!Array.isArray(body.cart) || body.cart.length > 100) return unavailable();
      const seen = new Set<string>();
      for (const row of body.cart) {
        if (!row || typeof row !== "object" || typeof row.key !== "string" || !/^[0-9a-f]{32}$/.test(row.key) ||
          seen.has(row.key) || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 9999) return unavailable();
        seen.add(row.key);
        cart.push({ key: row.key, quantity: row.quantity });
      }
    }
  } catch { return unavailable(); }
  // Vercel overwrites this platform header. Arbitrary forwarded headers never create a fresh bucket.
  const platformIp = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const requester = platformIp && isIP(platformIp) ? `ip:${platformIp}` : "unidentified-requester";
  try {
    const context = await getPublicDocumentOrderContext(token, requester);
    if (!publicDocumentSignupEnabled(context.companyId)) return reply(503, "카카오 점주 가입 연결을 준비 중입니다. 발행 회사 담당자에게 문의해 주세요.");
    if (cart.length && !publicDocumentShoppingEnabled(context.companyId)) return unavailable();
    const connected = cart.length
      ? await connectPublicDocumentOrder(context, cart) : await connectPublicDocumentOrder(context);
    if (connected) return NextResponse.json(connected, { headers });
    const intent = createPublicStoreOwnerOnboardingIntent({ companyId: context.companyId, documentId: context.documentId,
      documentVersionId: context.documentVersionId, shareLinkId: context.shareLinkId, nonce: randomUUID(), returnTo: `/pricing-document#${token}` });
    if (!intent) return reply(503, "카카오 점주 가입 연결을 준비 중입니다. 발행 회사 담당자에게 문의해 주세요.");
    return NextResponse.json({ intent, next: "kakao", expiresAt: new Date(Math.min(Date.now() + 300_000, Date.parse(context.expiresAt))).toISOString() }, { headers });
  } catch (error) {
    if (error instanceof DocumentSendError) return reply(error.status, error.message);
    return reply(503, "문서를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
