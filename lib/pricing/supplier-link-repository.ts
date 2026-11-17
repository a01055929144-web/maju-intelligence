import { buildSupplierProductWrite } from "../../domains/product/catalog-import";
import { prepareSupplierLinkGroups, type SupplierLinkInput } from "../../domains/pricing/supplier-link";
import { runLimited } from "../run-limited";
import { supabaseRequest } from "../store";

type Db = typeof supabaseRequest;
type MatchRow = { id: string; supplier_product_id: string; product_catalog_id: string; match_status: "auto" | "candidate" | "confirmed" | "rejected" };
const enc = encodeURIComponent;
const chunks = <T>(rows: readonly T[], size = 100) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const confirmed = (companyId: string, supplierProductId: string, productCatalogId: string) => ({
  brand_matches: true, candidate_rank: null, company_id: companyId, confirmed_at: new Date().toISOString(), conversion_confirmed: false,
  match_score: 100, match_status: "confirmed", name_matches: true, origin_matches: true,
  product_catalog_id: productCatalogId, spec_matches: true, supplier_product_id: supplierProductId, unit_matches: true
});

export async function linkSupplierProducts(companyId: string, links: readonly SupplierLinkInput[], db: Db = supabaseRequest) {
  const ids = Array.from(new Set(links.map((link) => link.productId)));
  const owned = await db<Array<{ id: string }>>(`product_catalog?select=id&company_id=eq.${enc(companyId)}&id=in.(${ids.map(enc).join(",")})`);
  const ownedIds = new Set(owned.map((row) => row.id));
  if (ownedIds.size !== ids.length) throw new Error("타사 상품은 매입처에 연결할 수 없습니다.");

  const suppliers = await db<Array<{ id: string; name: string }>>(`product_suppliers?select=id,name&company_id=eq.${enc(companyId)}`);
  const groups = prepareSupplierLinkGroups(links, suppliers.map((row) => row.name));
  const savedSuppliers = await db<Array<{ id: string; name: string }>>("product_suppliers?on_conflict=company_id,name", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(groups.map((group) => ({ company_id: companyId, name: group.supplierName, updated_at: new Date().toISOString() })))
  });
  const supplierIdByName = new Map(savedSuppliers.map((row) => [row.name, row.id]));
  const targets = new Map<string, string>();
  const productWrites = groups.flatMap((group) => {
    const supplierId = supplierIdByName.get(group.supplierName);
    if (!supplierId) throw new Error("매입처를 저장하지 못했습니다.");
    return group.products.map((product) => {
      targets.set(`${supplierId}:${product.sourceFingerprint}`, group.targetByFingerprint.get(product.sourceFingerprint)!);
      const { latest_cost: _latestCost, cost_confirmed: _costConfirmed, last_seen_date: _lastSeenDate, ...linkOnly } = buildSupplierProductWrite(companyId, supplierId, product);
      return linkOnly;
    });
  });

  const savedProducts: Array<{ id: string; supplier_id: string; source_fingerprint: string }> = [];
  for (const part of chunks(productWrites, 300)) await db(
    "supplier_products?on_conflict=company_id,supplier_id,source_fingerprint",
    { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(part) }
  );
  const fingerprints = productWrites.map((row) => String(row.source_fingerprint));
  for (const part of chunks(fingerprints)) savedProducts.push(...await db<typeof savedProducts>(
    `supplier_products?select=id,supplier_id,source_fingerprint&company_id=eq.${enc(companyId)}&source_fingerprint=in.(${part.map((value) => enc(`"${value.replaceAll('"', "")}"`)).join(",")})`
  ));
  const selectedProducts = new Map(savedProducts.flatMap((row) => {
    const key = `${row.supplier_id}:${row.source_fingerprint}`;
    return targets.has(key) ? [[key, row] as const] : [];
  }));
  if (selectedProducts.size !== targets.size) throw new Error("매입처 상품 연결 대상을 확인하지 못했습니다.");
  const pairs = Array.from(selectedProducts, ([key, row]) => ({ supplierProductId: row.id, productCatalogId: targets.get(key)! }));
  const matches: MatchRow[] = [];
  for (const part of chunks(pairs.map((pair) => pair.supplierProductId))) matches.push(...await db<MatchRow[]>(
    `supplier_product_matches?select=id,supplier_product_id,product_catalog_id,match_status&company_id=eq.${enc(companyId)}&supplier_product_id=in.(${part.map(enc).join(",")})`
  ));

  await runLimited(pairs, 12, async ({ supplierProductId, productCatalogId }) => {
    const rows = matches.filter((row) => row.supplier_product_id === supplierProductId);
    const active = rows.find((row) => row.match_status === "auto" || row.match_status === "confirmed");
    const target = rows.find((row) => row.product_catalog_id === productCatalogId);
    if (active?.product_catalog_id === productCatalogId) return;
    if (active) {
      if (target && target.id !== active.id) await db(`supplier_product_matches?id=eq.${enc(target.id)}&company_id=eq.${enc(companyId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await db(`supplier_product_matches?id=eq.${enc(active.id)}&company_id=eq.${enc(companyId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(confirmed(companyId, supplierProductId, productCatalogId))
      });
      return;
    }
    if (target) {
      await db(`supplier_product_matches?id=eq.${enc(target.id)}&company_id=eq.${enc(companyId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(confirmed(companyId, supplierProductId, productCatalogId))
      });
      return;
    }
    await db("supplier_product_matches", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(confirmed(companyId, supplierProductId, productCatalogId)) });
  });
  return { linked: pairs.length, attempted: links.length };
}
