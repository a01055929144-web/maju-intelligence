import { isIP } from "net";
import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getPublicDocumentOrderContext } from "@/lib/pricing/document-share";
import { publicDocumentShoppingEnabled } from "@/lib/pricing/public-document-order-feature";
import { readStorefrontCatalogPage } from "@/lib/pricing/storefront-catalog-read";
import { getStoreOrderMemberContextForCompany } from "@/lib/store/07-store-member-context";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const unavailable = () => NextResponse.json({ message: "연결된 매장으로 로그인한 뒤 전체 상품을 확인해 주세요." }, { status: 404, headers });

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return unavailable();
  const reader = request.body?.getReader();
  if (!reader) return unavailable();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) { await reader.cancel(); return unavailable(); }
      parts.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(parts).toString("utf8")) as { token?: unknown; page?: unknown; q?: unknown } | null;
    if (!body || typeof body.token !== "string" || !/^[\x21-\x7e]{1,200}$/.test(body.token) ||
      typeof body.page !== "number" || !Number.isSafeInteger(body.page) || body.page < 1 || body.page > 1000) return unavailable();
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
    const context = await getPublicDocumentOrderContext(body.token, ip && isIP(ip) ? `ip:${ip}` : "unidentified-requester");
    if (!publicDocumentShoppingEnabled(context.companyId) || !isFeatureEnabled("STORE_CATALOG_LINK", context.companyId)) return unavailable();
    const member = await getStoreOrderMemberContextForCompany(context.companyId);
    if (!member || member.companyId !== context.companyId) return unavailable();
    const query = typeof body.q === "string" ? body.q.trim().slice(0, 60).replace(/[%*,()]/g, " ") : "";
    const catalog = await readStorefrontCatalogPage({ companyId: member.companyId, customerId: member.customerId, marketPriceNotice: "" }, body.page, query, true);
    return NextResponse.json({ hasMore: catalog.hasMore, lines: catalog.lines.map(line => ({
      id: line.productId, name: line.name, spec: line.spec, unit: line.unit, price: line.price,
    })) }, { headers });
  } catch { return unavailable(); }
}
