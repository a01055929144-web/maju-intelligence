import { isIP } from "net";
import { NextRequest, NextResponse } from "next/server";
import { DocumentSendError } from "../../../../domains/pricing/document-send";
import { documentSharingEnabled } from "../../../../lib/pricing/document-share-feature";
import { readPublicDocument } from "../../../../lib/pricing/document-share";
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
    if (size > 1024) { await reader.cancel(); throw new Error("Body too large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function POST(request: NextRequest) {
  if (!documentSharingEnabled()) return unavailable();
  try {
    const origin = new URL(request.headers.get("origin") || "invalid");
    if (!["http:", "https:"].includes(origin.protocol) || origin.host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase())
      return reply(403, "같은 화면에서 다시 시도해 주세요.");
  } catch { return reply(403, "같은 화면에서 다시 시도해 주세요."); }
  let token: string;
  try {
    const body = await smallBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("token" in body) ||
      typeof body.token !== "string" || body.token.length > 200 || !/^[\x21-\x7e]+$/.test(body.token) || request.nextUrl.search)
      return unavailable();
    token = body.token;
  } catch { return unavailable(); }
  // Vercel overwrites this platform header. Arbitrary forwarded headers never create a fresh bucket.
  const platformIp = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const requester = platformIp && isIP(platformIp) ? `ip:${platformIp}` : "unidentified-requester";
  try {
    const result = await readPublicDocument(token, requester);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof DocumentSendError) return reply(error.status, error.message);
    return reply(503, "문서를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
