import { isIP } from "net";
import { NextRequest, NextResponse } from "next/server";
import { getPublicDocumentOrderContext } from "@/lib/pricing/document-share";
import { publicDocumentShoppingEnabled } from "@/lib/pricing/public-document-order-feature";
import { supabaseRequest } from "@/lib/store";
import { getStoreOrderMemberContextForCompany } from "@/lib/store/07-store-member-context";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const unavailable = () => NextResponse.json({ message: "장바구니를 확인하지 못했습니다. 연결된 매장으로 다시 로그인해 주세요." }, { status: 404, headers });

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
    const body = JSON.parse(Buffer.concat(parts).toString("utf8")) as { token?: unknown } | null;
    if (!body || typeof body.token !== "string" || !/^[\x21-\x7e]{1,200}$/.test(body.token)) return unavailable();
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
    const context = await getPublicDocumentOrderContext(body.token, ip && isIP(ip) ? `ip:${ip}` : "unidentified-requester");
    if (!publicDocumentShoppingEnabled(context.companyId)) return unavailable();
    const member = await getStoreOrderMemberContextForCompany(context.companyId);
    if (!member || member.companyId !== context.companyId) return unavailable();
    const saved = await supabaseRequest<Array<{ product_id: string; promotion_id: string | null; quantity: number }>>(
      "rpc/store_order_cart_lines", { method: "POST", body: JSON.stringify({
        p_company: context.companyId, p_account: member.storeAccountId, p_user: member.authUserId,
      }) });
    const byProduct = new Map(saved.map(row => [`${row.product_id}:${row.promotion_id ?? ""}`, row.quantity]));
    const quantities = Object.fromEntries(context.items.flatMap(item => {
      if (!item) return [];
      const quantity = byProduct.get(`${item.productId}:${item.promotionId ?? ""}`);
      return quantity ? [[item.key, quantity]] : [];
    }));
    return NextResponse.json({ quantities }, { headers });
  } catch { return unavailable(); }
}
