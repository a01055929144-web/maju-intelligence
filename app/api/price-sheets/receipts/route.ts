import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { attachPurchaseHistoryPreviousCosts, buildPurchaseReceiptRows, mergePurchaseHistoryRows, planMissingProductFields, planProductTaxTypes, resolvePurchaseHistoryRows, summarizePurchaseHistory, type PurchaseHistoryProductContext, type PurchaseHistoryRow, type PurchaseReceiptInputLine } from "@/domains/pricing/purchase-receipt";
import { supabaseRequest } from "@/lib/store";
import { runLimited } from "@/lib/run-limited";

export const dynamic = "force-dynamic";
const canCorrect = (companyId: string) => (process.env.PURCHASE_RECEIPT_CORRECTIONS_COMPANY_IDS || "").split(",").map((id) => id.trim()).includes(companyId);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

async function historyPages(path: string) {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const page = await supabaseRequest<Array<Record<string, unknown>>>(`${path}&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error("매입 이력이 10,000건을 넘어 현재 화면에서 모두 조회할 수 없습니다.");
}

async function listSupplierCostHistory(companyId: string, input: { from: string; to: string; search: string; productId: string; lineKey: string; supplier: string }) {
  const company = encodeURIComponent(companyId);
  const [history, matches, supplierProducts, catalog, suppliers] = await Promise.all([
    historyPages(`supplier_product_cost_history?select=id,supplier_product_id,price_date,purchase_price&company_id=eq.${company}&order=price_date.desc,created_at.desc`),
    historyPages(`supplier_product_matches?select=supplier_product_id,product_catalog_id&company_id=eq.${company}&match_status=in.(auto,confirmed)&order=supplier_product_id`),
    historyPages(`supplier_products?select=id,supplier_id,raw_name,raw_spec,raw_unit&company_id=eq.${company}&order=id`),
    historyPages(`product_catalog?select=id,product_code,canonical_name,sales_unit&company_id=eq.${company}&order=id`),
    historyPages(`product_suppliers?select=id,name&company_id=eq.${company}&order=id`)
  ]);
  const matchBySupplier = new Map(matches.map((row) => [String(row.supplier_product_id), String(row.product_catalog_id)]));
  const supplierProductById = new Map(supplierProducts.map((row) => [String(row.id), row]));
  const catalogById = new Map(catalog.map((row) => [String(row.id), row]));
  const supplierNames = new Map(suppliers.map((row) => [String(row.id), String(row.name || "")]));
  const namesByProduct = new Map<string, Set<string>>();
  for (const match of matches) {
    const productId = String(match.product_catalog_id);
    const supplierProduct = supplierProductById.get(String(match.supplier_product_id));
    const name = supplierNames.get(String(supplierProduct?.supplier_id || ""));
    if (name) namesByProduct.set(productId, (namesByProduct.get(productId) || new Set<string>()).add(name));
  }
  const normalizedSearch = input.search.toLocaleLowerCase("ko");
  const rows = history.filter((row) => row.supplier_product_id && row.price_date && row.purchase_price != null).map((row) => {
    const supplierProduct = supplierProductById.get(String(row.supplier_product_id));
    const catalogId = matchBySupplier.get(String(row.supplier_product_id)) || "";
    const product = catalogById.get(catalogId);
    const supplierName = supplierNames.get(String(supplierProduct?.supplier_id || "")) || "";
    return {
      id: String(row.id), receipt_date: String(row.price_date), line_key: `supplier-history|${row.supplier_product_id}`,
      product_catalog_id: catalogId || null, product_name: String(product?.canonical_name || supplierProduct?.raw_name || ""),
      spec: String(supplierProduct?.raw_spec || ""), unit: String(product?.sales_unit || supplierProduct?.raw_unit || ""), supplier_name: supplierName,
      quantity: null, unit_price: Number(row.purchase_price) || 0, unit_cost_ex_vat: Number(row.purchase_price) || 0,
      price_includes_vat: false, tax_type: null, total_amount: null, erp_code: String(product?.product_code || "")
    };
  }).filter((row) => (!input.productId || row.product_catalog_id === input.productId) && (!input.lineKey || row.line_key === input.lineKey) &&
    (!input.supplier || row.supplier_name === input.supplier) && (!normalizedSearch || `${row.product_name} ${row.supplier_name} ${row.erp_code}`.toLocaleLowerCase("ko").includes(normalizedSearch)));
  const context = new Map<string, PurchaseHistoryProductContext>();
  for (const [productId, product] of Array.from(catalogById.entries())) {
    const names = namesByProduct.get(productId);
    context.set(productId, { supplier: names?.size === 1 ? Array.from(names)[0] : "", unit: String(product.sales_unit || "") });
  }
  return { rows, context };
}

/**
 * 11/4: 매입 기록 보관 — 엑셀의 수량·공급가액·부가세·합계를 날짜·품목별로 남깁니다.
 * 같은 날 같은 품목을 다시 올리면 새 줄을 만들지 않고 덮어씁니다(company_id, dedupe_key).
 * 테이블(purchase_receipt_lines)은 운영 DB 승인 후 생성됩니다. 없으면 매입가 저장은 그대로 두고 안내만 합니다.
 */
/** 매입 이력은 서버에서 기간·품목을 좁히고 한 번에 100줄씩 읽습니다. */
export async function GET(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to))
    return NextResponse.json({ message: "조회 기간을 확인해 주세요." }, { status: 400 });
  const page = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) return NextResponse.json({ message: "조회 페이지를 확인해 주세요." }, { status: 400 });
  const search = (params.get("search") || "").replace(/[^a-zA-Z0-9\u3131-\uD79D\s-]/g, "").trim().slice(0, 80);
  const productId = params.get("productId") || "";
  if (productId && !/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ message: "품목 번호를 확인해 주세요." }, { status: 400 });
  const lineKey = (params.get("lineKey") || "").trim().slice(0, 240);
  const supplier = (params.get("supplier") || "").trim().slice(0, 120);
  const filters = [from && `receipt_date=gte.${from}`, to && `receipt_date=lte.${to}`, productId && `product_catalog_id=eq.${productId}`,
    lineKey && `line_key=eq.${encodeURIComponent(lineKey)}`].filter(Boolean);
  const correctionEnabled = canCorrect(auth.companyId);
  const receiptTable = correctionEnabled ? "purchase_receipt_effective" : "purchase_receipt_lines";
  const select = `select=id,receipt_date,line_key,product_catalog_id,product_name,spec,unit,supplier_name,quantity,unit_price,unit_cost_ex_vat,price_includes_vat,tax_type,total_amount${correctionEnabled ? ",correction_revision,corrected" : ""}`;
  const rows = await historyPages(`${receiptTable}?${select}&company_id=eq.${encodeURIComponent(auth.companyId)}&${filters.join("&")}${filters.length ? "&" : ""}order=receipt_date.desc,id.desc`).catch(() => null);
  if (!rows) return NextResponse.json({ message: "매입 이력을 불러오지 못했습니다." }, { status: 500 });
  const receiptHistory = from ? await historyPages(`${receiptTable}?${select}&company_id=eq.${encodeURIComponent(auth.companyId)}&${filters.filter((filter) => !filter.startsWith("receipt_date=")).join("&")}&order=receipt_date.desc,id.desc`).catch(() => rows) : rows;
  const supplierHistory = await listSupplierCostHistory(auth.companyId, { from: "", to: "", search, productId, lineKey, supplier }).catch(() => null);
  if (!supplierHistory) return NextResponse.json({ message: "매입 이력이 10,000건을 넘거나 원가 이력을 읽지 못했습니다. 관리자에게 조회 범위 확장을 요청해 주세요." }, { status: 500 });
  const matchesReceiptFilter = (row: PurchaseHistoryRow) => (!supplier || row.supplier_name === supplier) && (!search || `${row.product_name} ${row.supplier_name || ""}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko")));
  const receiptHistoryRows = resolvePurchaseHistoryRows(receiptHistory as PurchaseHistoryRow[], supplierHistory.context).filter(matchesReceiptFilter).map((row) => ({ ...row, correctable: correctionEnabled }));
  const supplierHistoryRows = supplierHistory.rows.map((row) => ({ ...row, correctable: false }));
  const sortHistory = (a: PurchaseHistoryRow, b: PurchaseHistoryRow) => String(b.receipt_date).localeCompare(String(a.receipt_date)) || String(b.id).localeCompare(String(a.id));
  const combined = mergePurchaseHistoryRows(receiptHistoryRows, supplierHistoryRows).sort(sortHistory);
  let period = mergePurchaseHistoryRows(resolvePurchaseHistoryRows(rows as PurchaseHistoryRow[], supplierHistory.context).filter(matchesReceiptFilter).map((row) => ({ ...row, correctable: correctionEnabled })), supplierHistoryRows.filter((row) => (!from || String(row.receipt_date) >= from) && (!to || String(row.receipt_date) <= to))).sort(sortHistory);
  if (params.get("summary") === "1") return NextResponse.json({ summary: summarizePurchaseHistory(period), count: period.length }, { headers: { "Cache-Control": "no-store" } });
  if (params.get("changed") === "1") {
    const changed = new Set(summarizePurchaseHistory(attachPurchaseHistoryPreviousCosts(combined, period)).filter((item) => item.changeAmount).map((item) => item.key));
    period = period.filter((row) => changed.has(`${row.product_catalog_id || row.line_key}|${row.supplier_name || ""}`));
  }
  const offset = (page - 1) * 100;
  const visible = attachPurchaseHistoryPreviousCosts(combined as PurchaseHistoryRow[], period.slice(offset, offset + 100) as PurchaseHistoryRow[]);
  const items = visible.map((row) => {
    const { correction_revision, ...item } = row as PurchaseHistoryRow & { correction_revision?: unknown };
    return { ...item, correctionRevision: Number(correction_revision || 0) };
  });
  return NextResponse.json({ canCorrect: correctionEnabled, hasMore: period.length > offset + 100, rows: items }, { headers: { "Cache-Control": "no-store" } });
}

/** 원본 엑셀 행은 보존하고 정정 값·사유만 한 트랜잭션으로 추가합니다. */
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; id?: string; productId?: string; cost?: number; reason?: string; expectedRevision?: number } | null;
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId) || !canCorrect(auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!body?.id || !uuid.test(body.id) || (body.productId && !uuid.test(body.productId)) ||
    typeof body.cost !== "number" || !Number.isFinite(body.cost) || body.cost < 0 || body.cost > 1_000_000_000 ||
    Math.abs(Math.round(body.cost * 100) - body.cost * 100) > 1e-8 || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision! < 0 ||
    !body.reason || body.reason.trim().length < 5 || body.reason.trim().length > 500)
    return NextResponse.json({ message: "품목·단가·정정 사유를 확인해 주세요." }, { status: 400 });
  try {
    const result = await supabaseRequest<{ revision: number }>("rpc/correct_purchase_receipt_line", {
      method: "POST",
      body: JSON.stringify({ p_company: auth.companyId, p_line: body.id, p_product: body.productId || null,
        p_cost: body.cost, p_reason: body.reason.trim(), p_actor: auth.customerSession?.name || auth.adminSession?.name || "운영자",
        p_expected_revision: body.expectedRevision })
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ message: message.includes("receipt_correction_conflict") ? "다른 사용자가 먼저 정정했습니다. 새로고침 후 다시 시도해 주세요." :
      message.includes("product_not_in_company") ? "같은 회사의 상품을 선택해 주세요." : "정정을 저장하지 못했습니다." }, { status: message.includes("receipt_correction_conflict") ? 409 : 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; fileName?: string; lines?: PurchaseReceiptInputLine[]; receiptDate?: string } | null;
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const receiptDate = String(body?.receiptDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) return NextResponse.json({ message: "매입일을 확인해 주세요." }, { status: 400 });
  const lines = Array.isArray(body?.lines) ? body!.lines.slice(0, 5000) : [];
  const companyId = auth.companyId;
  const productIds = Array.from(new Set(lines.map((line) => line.productId).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))));
  const products = new Map<string, string | null>();
  const productFields = new Map<string, { spec: string; unit: string }>();
  for (let offset = 0; offset < productIds.length; offset += 100) {
    const part = productIds.slice(offset, offset + 100);
    const found = await supabaseRequest<Array<{ id: string; tax_type: string | null; spec_value: number | null; spec_unit: string | null; sales_unit: string | null }>>(
      `product_catalog?select=id,tax_type,spec_value,spec_unit,sales_unit&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${part.map(encodeURIComponent).join(",")})`
    ).catch(() => []);
    for (const row of found) {
      products.set(row.id, row.tax_type);
      productFields.set(row.id, { spec: [row.spec_value, row.spec_unit].filter((value) => value != null && value !== "").join(""), unit: row.sales_unit || "" });
    }
  }
  const rows = buildPurchaseReceiptRows({
    knownProductIds: new Set(products.keys()),
    actorName: auth.customerSession?.name || auth.adminSession?.name || "운영자",
    companyId: auth.companyId,
    fileName: String(body?.fileName || "").slice(0, 200),
    lines: lines.map((line) => ({ ...line, supplier: line.supplier?.trim() || "기본 매입처" })),
    receiptDate
  });
  if (!rows.length) return NextResponse.json({ saved: 0 });
  try {
    for (let offset = 0; offset < rows.length; offset += 500) {
      await supabaseRequest("purchase_receipt_lines?on_conflict=company_id,dedupe_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.slice(offset, offset + 500))
      });
    }
    // 상품 과세 구분 채우기(비어 있는 상품만).
    const plan = planProductTaxTypes(lines, products);
    let taxFilled = 0;
    for (const taxType of ["taxable", "exempt"] as const) {
      const ids = plan.fill.filter((item) => item.taxType === taxType).map((item) => item.productId);
      for (let offset = 0; offset < ids.length; offset += 100) {
        const part = ids.slice(offset, offset + 100);
        await supabaseRequest(`product_catalog?company_id=eq.${encodeURIComponent(companyId)}&tax_type=is.null&id=in.(${part.map(encodeURIComponent).join(",")})`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ tax_type: taxType, updated_at: new Date().toISOString() })
        }).then(() => { taxFilled += part.length; }).catch(() => null);
      }
    }
    // 나중에 올린 파일로 상품의 빈 칸(규격·단위)을 채웁니다(있는 값은 그대로).
    let fieldsFilled = 0;
    await runLimited(planMissingProductFields(lines, productFields).slice(0, 300), 10, async (item) => {
      await supabaseRequest(`product_catalog?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(item.productId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...item.values, updated_at: new Date().toISOString() })
      }).then(() => { fieldsFilled += 1; }).catch(() => null);
    });
    return NextResponse.json({ fieldsFilled, saved: rows.length, taxConflicts: plan.conflicts.length, taxFilled });
  } catch (error) {
    const missing = error instanceof Error && /purchase_receipt_lines|PGRST205|42P01|404/.test(error.message);
    return NextResponse.json({ message: missing ? "DB 승인 후 시작됩니다" : "저장하지 못했습니다" }, { status: missing ? 503 : 500 });
  }
}
