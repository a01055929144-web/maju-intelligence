import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { buildCatalogPreview, type CatalogMapping } from "@/domains/product/catalog-import";
import { saveProductCatalogImport } from "@/lib/product-catalog-import";
import { supabaseRequest } from "@/lib/store";
import { runLimited } from "@/lib/run-limited";

export const dynamic = "force-dynamic";

type LinkInput = { productId: string; rawName: string; spec?: string; unit?: string; cost: number; supplierName?: string };
const MAPPING: CatalogMapping = { productName: "상품명", spec: "규격", unit: "단위", cost: "매입가" };

/**
 * 11/4: 엑셀 원문을 기존 상품에 연결해 둡니다(매입처 상품 → 우리 상품, 확정 연결).
 * 다음에 같은 원문이 오면 이름·규격이 달라도 이 상품으로 붙습니다. 새 테이블 없이 supplier_products·supplier_product_matches 사용.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; fileName?: string; links?: LinkInput[] } | null;
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const companyId = auth.companyId;
  const links = (Array.isArray(body?.links) ? body!.links : []).filter((link) => /^[0-9a-f-]{36}$/i.test(link.productId) && link.rawName?.trim() && Number.isFinite(Number(link.cost))).slice(0, 500);
  if (!links.length) return NextResponse.json({ linked: 0 });
  const ids = Array.from(new Set(links.map((link) => link.productId)));
  const owned = await supabaseRequest<Array<{ id: string }>>(`product_catalog?select=id&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${ids.map(encodeURIComponent).join(",")})`).catch(() => []);
  const ownedIds = new Set(owned.map((row) => row.id));
  const groups = new Map<string, LinkInput[]>();
  for (const link of links.filter((item) => ownedIds.has(item.productId))) {
    const supplier = link.supplierName?.trim() || "기본 매입처";
    groups.set(supplier, [...(groups.get(supplier) || []), link]);
  }
  let linked = 0;
  try {
    for (const [supplierName, items] of Array.from(groups.entries())) {
      const raw = items.map((item) => ({ 단위: item.unit || "", 매입가: Number(item.cost), 상품명: item.rawName.trim(), 규격: item.spec || "" }));
      const preview = buildCatalogPreview(raw, MAPPING, supplierName);
      if (!preview.products.length) continue;
      const saved = await saveProductCatalogImport({ companyId, createdByName: auth.customerSession?.name || auth.adminSession?.name || "운영자", excludedCount: preview.excludedCount, fileName: (body?.fileName || "원문 연결").slice(0, 200), mapping: MAPPING, products: preview.products, supplierName, warnings: preview.warnings });
      const fingerprints = preview.products.map((product) => product.sourceFingerprint);
      const supplierProducts = await supabaseRequest<Array<{ id: string; source_fingerprint: string }>>(
        `supplier_products?select=id,source_fingerprint&company_id=eq.${encodeURIComponent(companyId)}&supplier_id=eq.${encodeURIComponent(saved.supplierId)}&source_fingerprint=in.(${fingerprints.map((value) => `"${value.replaceAll('"', "")}"`).map(encodeURIComponent).join(",")})`
      );
      const byFingerprint = new Map(supplierProducts.map((row) => [row.source_fingerprint, row.id]));
      await runLimited(preview.products, 8, async (product) => {
        const supplierProductId = byFingerprint.get(product.sourceFingerprint);
        const target = items.find((item) => item.rawName.trim() === product.rawName || item.rawName.trim().replace(/\s+/g, " ") === product.rawName)?.productId;
        if (!supplierProductId || !target) return;
        await supabaseRequest(`supplier_product_matches?company_id=eq.${encodeURIComponent(companyId)}&supplier_product_id=eq.${encodeURIComponent(supplierProductId)}&product_catalog_id=neq.${encodeURIComponent(target)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        await supabaseRequest("supplier_product_matches?on_conflict=company_id,supplier_product_id,product_catalog_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ brand_matches: true, candidate_rank: null, company_id: companyId, confirmed_at: new Date().toISOString(), conversion_confirmed: false, match_score: 100, match_status: "confirmed", name_matches: true, origin_matches: true, product_catalog_id: target, spec_matches: true, supplier_product_id: supplierProductId, unit_matches: true })
        });
        linked++;
      });
    }
    return NextResponse.json({ linked });
  } catch (error) {
    return NextResponse.json({ linked, message: error instanceof Error ? error.message : "원문 연결을 저장하지 못했습니다." }, { status: 500 });
  }
}
