import "server-only";
import { supabaseRequest } from "@/lib/store";

export type StageFQueueSource = {
  count: number | null;
  ids: string[];
  key: "uploads" | "products" | "links" | "orders";
  label: string;
  message: string;
  status: "ready" | "error";
};

type Upload = { id: string; status: string; quality_score: number; duplicate_count: number; ai_reports: Array<{ id: string }> | null };
type Product = { id: string; canonical_name: string | null; purchase_product_name: string | null; sales_unit: string | null; tax_type: string | null };
type SupplierProduct = { id: string };
type Match = { supplier_product_id: string; match_status: string; conversion_confirmed: boolean };
type Link = { id: string; can_order: boolean; expires_at: string; revoked_at: string | null };
type Order = { id: string; customer_id: string | null; document_version_id: string | null; link_id: string | null };

const PAGE_SIZE = 1000;

async function readAll<T>(path: string) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await supabaseRequest<T[]>(`${path}&limit=${PAGE_SIZE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function ready(key: StageFQueueSource["key"], label: string, ids: string[], message: string): StageFQueueSource {
  return { count: ids.length, ids: ids.slice(0, 20), key, label, message, status: "ready" };
}

function error(key: StageFQueueSource["key"], label: string): StageFQueueSource {
  return { count: null, ids: [], key, label, message: "0건이 아니라 조회 실패 상태입니다.", status: "error" };
}

export async function getStageFQueue(companyId: string): Promise<StageFQueueSource[]> {
  const company = encodeURIComponent(companyId);
  const [uploads, products, supplierProducts, matches, links, orders] = await Promise.allSettled([
    readAll<Upload>(`customer_imports?select=id,status,quality_score,duplicate_count,ai_reports(id)&company_id=eq.${company}&order=id`),
    readAll<Product>(`product_catalog?select=id,canonical_name,purchase_product_name,sales_unit,tax_type&company_id=eq.${company}&is_active=eq.true&order=id`),
    readAll<SupplierProduct>(`supplier_products?select=id&company_id=eq.${company}&is_active=eq.true&order=id`),
    readAll<Match>(`supplier_product_matches?select=supplier_product_id,match_status,conversion_confirmed&company_id=eq.${company}&match_status=in.(auto,confirmed)&order=supplier_product_id`),
    readAll<Link>(`storefront_links?select=id,can_order,expires_at,revoked_at&company_id=eq.${company}&order=id`),
    readAll<Order>(`store_orders?select=id,customer_id,document_version_id,link_id&company_id=eq.${company}&order=id`)
  ]);

  const uploadQueue = uploads.status === "fulfilled"
    ? ready("uploads", "적재 품질", uploads.value.filter((row) => row.status === "failed" || row.quality_score < 80 || row.duplicate_count > 0 || !row.ai_reports?.length).map((row) => row.id), "실패·저품질·중복·리포트 미생성 적재")
    : error("uploads", "적재 품질");

  let productQueue = error("products", "품목 품질");
  if (products.status === "fulfilled" && supplierProducts.status === "fulfilled" && matches.status === "fulfilled") {
    const matched = new Set(matches.value.filter((row) => row.match_status === "auto" || row.match_status === "confirmed").map((row) => row.supplier_product_id));
    const unconfirmed = new Set(matches.value.filter((row) => !row.conversion_confirmed).map((row) => row.supplier_product_id));
    const ids = [
      ...products.value.filter((row) => !(row.canonical_name || row.purchase_product_name) || !row.sales_unit || !row.tax_type).map((row) => row.id),
      ...supplierProducts.value.filter((row) => !matched.has(row.id) || unconfirmed.has(row.id)).map((row) => row.id)
    ];
    productQueue = ready("products", "품목 품질", Array.from(new Set(ids)), "필수 품목값·매입품 연결·단위 환산 확인 필요");
  }

  const linkQueue = links.status === "fulfilled"
    ? ready("links", "링크 상태", links.value.filter((row) => row.can_order && (Boolean(row.revoked_at) || Date.parse(row.expires_at) <= Date.now())).map((row) => row.id), "회수·만료됐지만 주문 가능 상태인 링크")
    : error("links", "링크 상태");

  let orderQueue = error("orders", "주문 원천");
  if (orders.status === "fulfilled" && links.status === "fulfilled") {
    const linkIds = new Set(links.value.map((row) => row.id));
    orderQueue = ready("orders", "주문 원천", orders.value.filter((row) => !row.customer_id || !row.document_version_id || !row.link_id || !linkIds.has(row.link_id)).map((row) => row.id), "거래처·게시본·링크 원천 ID가 없는 주문");
  }

  return [uploadQueue, productQueue, linkQueue, orderQueue];
}
