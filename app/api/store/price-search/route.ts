import { NextRequest, NextResponse } from "next/server";
import { isId, koreaDay } from "@/domains/pricing/document";
import { storePriceDocumentKey, type StorePriceRow } from "@/domains/pricing/store-price-search";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { readPublicDocument } from "@/lib/pricing/document-share";
import { readStorefront } from "@/lib/pricing/storefront";
import { readStorefrontCatalogPage } from "@/lib/pricing/storefront-catalog-read";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { listStorePortalAccounts } from "@/lib/store/07-store-portal";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const unavailable = () => NextResponse.json({ message: "이 매장의 단가를 볼 수 없습니다." }, { status: 404, headers });

export async function GET(request: NextRequest) {
  const { searchParams: params } = request.nextUrl;
  const companyId = params.get("companyId"), storeAccountId = params.get("storeAccountId");
  const kind = params.get("kind"), documentId = params.get("document");
  if (!isId(companyId) || !isId(storeAccountId) || !isFeatureEnabled("STORE_PRICE_SEARCH", companyId)) return unavailable();
  if (kind !== "sheet" && kind !== "quote" && kind !== "catalog") return unavailable();
  const page = Number(params.get("page") ?? "1");
  const query = (params.get("q") ?? "").trim().slice(0, 60);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return unavailable();

  try {
    const member = await getStoreMemberContext({ companyId, storeAccountId });
    if (!member) return unavailable();
    const accounts = await listStorePortalAccounts();
    const account = accounts?.find(row => row.companyId === companyId && row.storeAccountId === storeAccountId);
    if (!account) return unavailable();
    if (kind === "catalog") {
      if (!isFeatureEnabled("STORE_CATALOG_LINK", companyId)) return unavailable();
      const href = account.catalogHref ?? account.documents.find(doc => doc.canOrder && doc.href.startsWith("/store#"))?.href;
      const store = href && await readStorefront(href.split("#")[1]);
      if (!store || store.companyId !== companyId) return unavailable();
      const result = await readStorefrontCatalogPage(store, page, query.replace(/[%*,()]/g, " "), true);
      const rows: StorePriceRow[] = result.lines.map(line => ({
        id: line.productId, name: line.name, spec: line.spec, unit: line.unit,
        price: line.price, recent: line.lastDispatch,
      }));
      return NextResponse.json({ rows, hasMore: result.hasMore }, { headers });
    }
    const document = account.documents.find(doc => doc.kind === kind && storePriceDocumentKey(doc.href) === documentId);
    if (!document) return unavailable();
    const token = document.href.split("#")[1];
    let rows: StorePriceRow[];
    if (document.href.startsWith("/pricing-document#")) {
      const { document: published } = await readPublicDocument(token, `store-price-search:${storeAccountId}`);
      rows = published.lines.map((line, index) => ({
        id: String(index), name: line.displayName, spec: line.spec, unit: line.unit,
        price: published.expired ? null : line.price, recent: null,
      }));
    } else {
      const store = await readStorefront(token);
      if (!store || store.companyId !== companyId) return unavailable();
      rows = store.lines.map(line => ({
        id: line.key, name: line.name, spec: line.spec, unit: line.unit,
        price: store.priceAvailable && document.validUntil >= koreaDay() && !line.isMarketPrice ? line.unitPrice : null,
        recent: null,
      }));
    }
    const normalized = query.toLocaleLowerCase("ko-KR");
    const filtered = rows.filter(row => `${row.name} ${row.spec}`.toLocaleLowerCase("ko-KR").includes(normalized));
    return NextResponse.json({ rows: filtered.slice((page - 1) * 50, page * 50), hasMore: filtered.length > page * 50 }, { headers });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && [403, 404].includes(Number(error.status))) return unavailable();
    return NextResponse.json({ message: "단가를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 503, headers });
  }
}
