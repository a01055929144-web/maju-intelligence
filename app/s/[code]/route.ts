import { createHash } from "crypto";
import { documentShareLinkId } from "@/domains/pricing/document-share";
import { NextResponse } from "next/server";
import { issueStoreLinkToken } from "@/lib/pricing/store-link-token";
import { isSharePreviewBot, isShortShareCode, shortShareDevice, shortShareLinksEnabled, shortShareLinksGloballyEnabled } from "@/lib/pricing/short-share-feature";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

const unavailableHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
  "Referrer-Policy": "no-referrer",
};

function unavailable() {
  return new NextResponse("사용할 수 없는 공유 링크입니다. 발행 회사에 새 링크를 요청해 주세요.", { status: 404, headers: unavailableHeaders });
}

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (documentShareLinkId(code)) {
    try {
      const requester = `${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}:${request.headers.get("user-agent") || ""}`;
      const { resolveDocumentShortLink } = await import("@/lib/pricing/document-share");
      const link = await resolveDocumentShortLink(code, requester);
      // Crawlers receive only the token-free metadata URL; humans use the original fragment route.
      const target = isSharePreviewBot(request.headers.get("user-agent") || "") ? link.previewPath : link.documentPath;
      return NextResponse.redirect(new URL(target, request.url), { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
    } catch { return unavailable(); }
  }
  if (!shortShareLinksGloballyEnabled() || !process.env.STORE_LINK_SECRET || !isShortShareCode(code)) return unavailable();
  const userAgent = request.headers.get("user-agent") || "";
  const identity = `${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}:${userAgent}`;
  const requesterHash = createHash("sha256")
    .update(`${process.env.STORE_LINK_SECRET}:${identity}`)
    .digest("hex");
  try {
    const links = await supabaseRequest<Array<{ id: string; company_id: string; token_nonce: string; token_hash: string }>>(
      `storefront_links?short_code=eq.${encodeURIComponent(code)}&select=id,company_id,token_nonce,token_hash&limit=1`,
    );
    const link = links[0];
    if (!link || !shortShareLinksEnabled(link.company_id)) return unavailable();
    const resolved = await supabaseRequest<Array<{ status?: string; companyId?: string; storefrontLinkId?: string }> | { status?: string; companyId?: string; storefrontLinkId?: string }>(
      "rpc/resolve_storefront_short_link_v1",
      { method: "POST", body: JSON.stringify({
        p_short_code: code,
        p_requester_hash: requesterHash,
        p_device_class: shortShareDevice(userAgent),
        p_is_preview_bot: isSharePreviewBot(userAgent),
        p_expected_company_id: link.company_id,
      }) },
    );
    const result = Array.isArray(resolved) ? resolved[0] : resolved;
    if (result?.status !== "available" || result.companyId !== link.company_id || result.storefrontLinkId !== link.id) return unavailable();
    const token = issueStoreLinkToken(result.storefrontLinkId, link.token_nonce);
    if (token.hash !== link.token_hash) return unavailable();
    const target = new URL("/store", request.url);
    target.hash = token.token;
    return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return unavailable();
  }
}
