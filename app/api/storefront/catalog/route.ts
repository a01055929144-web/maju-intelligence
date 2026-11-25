import { NextRequest, NextResponse } from "next/server";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { readStorefront } from "@/lib/pricing/storefront";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { readStorefrontCatalogPage } from "@/lib/pricing/storefront-catalog-read";

export const dynamic = "force-dynamic";

// CC-36a: 매장 화면 "전체 상품"(읽기 전용, 주문은 36c). 매장은 받은 링크(토큰)로 들어오고, 회사·매장은 토큰에서 정한다.
// 가격은 서버 함수 margin_template_price_v1 결과만 쓴다(여기서 계산하지 않음). 스위치 STORE_CATALOG_LINK 기본 OFF.
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const unavailable = () => NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404, headers });
const sameOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  try { return Boolean(origin) && new URL(origin!).host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase(); } catch { return false; }
};

/** body: { token, page?, q?, received? } — received=true면 받은 단가표에 있는 품목만(CX-149). */
export async function POST(request: NextRequest) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) return unavailable();
  if (!sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers });
  const body = await request.json().catch(() => null) as { token?: unknown; page?: unknown; q?: unknown; received?: unknown } | null;
  if (!body || typeof body.token !== "string" || body.token.length > 200) return unavailable();
  const page = body.page === undefined ? 1 : Number(body.page);
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 60).replace(/[%*,()]/g, " ") : "";
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return NextResponse.json({ message: "페이지를 확인해 주세요." }, { status: 400, headers });
  try {
    const store = await readStorefront(body.token);
    if (!store || !isFeatureEnabled("STORE_CATALOG_LINK", store.companyId)) return unavailable();
    return NextResponse.json(await readStorefrontCatalogPage(store, page, q, false, body.received === true), { headers });
  } catch (error) {
    console.error("storefront catalog failed", error);
    return NextResponse.json({ message: "전체 상품을 불러오지 못했습니다." }, { status: 500, headers });
  }
}
