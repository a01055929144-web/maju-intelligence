import "server-only";
import { getSupabaseConfig } from "@/lib/store";

export type StageFQueueSource = {
  count: number | null;
  ids: string[];
  key: "uploads" | "products" | "links" | "orders";
  label: string;
  message: string;
  status: "ready" | "error";
};

type IssueRows = { ids: string[]; total: number };

async function readIssues(path: string): Promise<IssueRows> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const response = await fetch(`${config.url}/rest/v1/${path}&order=id&limit=20`, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Prefer: "count=exact" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Stage F queue read failed: ${response.status}`);
  const total = Number(response.headers.get("content-range")?.split("/")[1]);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Stage F queue count missing.");
  const rows = await response.json() as Array<{ id: string }>;
  return { ids: rows.map((row) => row.id), total };
}

/** 문서 버전이 없는 주문 중 전체 상품(catalog) 링크 주문은 정상 — 문서 링크 주문만 이상으로 센다. */
async function readNullVersionDocumentOrders(company: string): Promise<IssueRows> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` };
  const read = async <T,>(path: string): Promise<T[]> => {
    const response = await fetch(`${config.url}/rest/v1/${path}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Stage F queue read failed: ${response.status}`);
    return (await response.json()) as T[];
  };
  const orders = await read<{ id: string; link_id: string }>(`store_orders?select=id,link_id&company_id=eq.${company}&document_version_id=is.null&customer_id=not.is.null&link_id=not.is.null&order=id&limit=1000`);
  if (!orders.length) return { ids: [], total: 0 };
  const linkIds = Array.from(new Set(orders.map((order) => order.link_id)));
  const catalog = new Set((await read<{ id: string }>(`storefront_links?select=id&company_id=eq.${company}&source=eq.catalog&id=in.(${linkIds.map(encodeURIComponent).join(",")})`)).map((link) => link.id));
  const broken = orders.filter((order) => !catalog.has(order.link_id));
  return { ids: broken.slice(0, 20).map((order) => order.id), total: broken.length };
}

function ready(key: StageFQueueSource["key"], label: string, issues: IssueRows, message: string): StageFQueueSource {
  return { count: issues.total, ids: issues.ids.slice(0, 20), key, label, message, status: "ready" };
}

function error(key: StageFQueueSource["key"], label: string): StageFQueueSource {
  return { count: null, ids: [], key, label, message: "0건이 아니라 조회 실패 상태입니다.", status: "error" };
}

function combine(...parts: IssueRows[]): IssueRows {
  return { ids: Array.from(new Set(parts.flatMap((part) => part.ids))).slice(0, 20), total: parts.reduce((sum, part) => sum + part.total, 0) };
}

export async function getStageFQueue(companyId: string): Promise<StageFQueueSource[]> {
  const company = encodeURIComponent(companyId);
  const now = encodeURIComponent(new Date().toISOString());
  const [uploads, catalog, unmatchedSupplierProducts, unconfirmedConversions, links, orders] = await Promise.allSettled([
    readIssues(`customer_imports?select=id,ai_reports(id)&company_id=eq.${company}&or=(status.eq.failed,quality_score.lt.80,duplicate_count.gt.0,ai_reports.is.null)`),
    readIssues(`product_catalog?select=id&company_id=eq.${company}&is_active=eq.true&or=(and(canonical_name.is.null,purchase_product_name.is.null),sales_unit.is.null,tax_type.is.null)`),
    readIssues(`supplier_products?select=id,active_match:supplier_product_matches!supplier_product_matches_product_fk()&company_id=eq.${company}&is_active=eq.true&active_match.match_status=in.(auto,confirmed)&active_match=is.null`),
    readIssues(`supplier_products?select=id,active_match:supplier_product_matches!supplier_product_matches_product_fk!inner()&company_id=eq.${company}&is_active=eq.true&active_match.match_status=in.(auto,confirmed)&active_match.conversion_confirmed=eq.false`),
    readIssues(`storefront_links?select=id&company_id=eq.${company}&can_order=eq.true&or=(revoked_at.not.is.null,expires_at.lte.${now})`),
    Promise.all([
      readIssues(`store_orders?select=id&company_id=eq.${company}&or=(customer_id.is.null,link_id.is.null)`),
      readNullVersionDocumentOrders(company)
    ]).then(([missing, nullVersion]) => combine(missing, nullVersion))
  ]);

  const uploadQueue = uploads.status === "fulfilled" ? ready("uploads", "적재 품질", uploads.value, "실패·저품질·중복·리포트 미생성 적재") : error("uploads", "적재 품질");
  const productQueue = catalog.status === "fulfilled" && unmatchedSupplierProducts.status === "fulfilled" && unconfirmedConversions.status === "fulfilled"
    ? ready("products", "품목 품질", combine(catalog.value, unmatchedSupplierProducts.value, unconfirmedConversions.value), "필수 품목값·매입품 연결·단위 환산 확인 필요")
    : error("products", "품목 품질");
  const linkQueue = links.status === "fulfilled" ? ready("links", "링크 상태", links.value, "회수·만료됐지만 주문 가능 상태인 링크") : error("links", "링크 상태");
  const orderQueue = orders.status === "fulfilled" ? ready("orders", "주문 원천", orders.value, "거래처·게시본·링크 원천 ID가 없는 주문") : error("orders", "주문 원천");
  return [uploadQueue, productQueue, linkQueue, orderQueue];
}
