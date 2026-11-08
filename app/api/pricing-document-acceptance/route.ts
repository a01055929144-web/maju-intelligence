import { NextRequest, NextResponse } from "next/server";
import { acceptSharedPricingDocument } from "../../../application/pricing/accept-shared-pricing-document";
import { pricingAcceptanceRepository } from "../../../lib/pricing/acceptance-order-link";
import { quoteAcceptanceEnabled } from "../../../lib/pricing/acceptance-feature";
import {
  parseSharedAcceptanceInput,
  SharedAcceptanceError,
  verifySharedPricingAcceptance,
} from "../../../lib/pricing/shared-acceptance-context";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const reply = (status: number, message: string) => NextResponse.json({ message }, { status, headers: responseHeaders });

async function smallBody(request: NextRequest) {
  if (request.headers.get("content-type")?.toLowerCase().split(";")[0].trim() !== "application/json")
    throw new SharedAcceptanceError("수락 요청을 확인해 주세요.", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new SharedAcceptanceError("수락 요청을 확인해 주세요.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); throw new SharedAcceptanceError("수락 요청을 확인해 주세요.", 400); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new SharedAcceptanceError("수락 요청을 확인해 주세요.", 400); }
}

export async function POST(request: NextRequest) {
  if (!quoteAcceptanceEnabled()) return reply(404, "수락할 공유 문서를 찾을 수 없습니다.");
  try {
    let origin: URL;
    try { origin = new URL(request.headers.get("origin") || "invalid"); }
    catch { return reply(403, "같은 화면에서 다시 시도해 주세요."); }
    if (!["http:", "https:"].includes(origin.protocol) || origin.host.toLowerCase() !==
      (request.headers.get("host") || request.nextUrl.host).toLowerCase())
      return reply(403, "같은 화면에서 다시 시도해 주세요.");
    const input = parseSharedAcceptanceInput(await smallBody(request));
    const context = await verifySharedPricingAcceptance(request, input.shareToken, input);
    return NextResponse.json(await acceptSharedPricingDocument(pricingAcceptanceRepository, context, input), { headers: responseHeaders });
  } catch (error) {
    if (error instanceof SharedAcceptanceError)
      return reply(error.status, error.message);
    if (error instanceof Error && /Idempotency conflict/i.test(error.message))
      return reply(409, "같은 재시도 키에 다른 수락 요청이 있습니다.");
    if (error instanceof Error && /(readonly_link_existing_orderable_conflict|orderable_link_existing_readonly_conflict)/.test(error.message))
      return reply(409, "기존 링크를 회수한 뒤 다시 수락해 새 주문 링크를 발급해 주세요.");
    console.error("Pricing document acceptance failed.");
    return reply(500, "문서를 수락하지 못했습니다.");
  }
}
