import { supabaseRequest } from "./store";

const enc = encodeURIComponent;

export type ProductSupplierDirectory = {
  suppliers: ProductSupplierSummary[];
  products: ProductSupplierProduct[];
  costHistory: ProductSupplierCostHistory[];
  imports: ProductSupplierImport[];
  comparisons: ProductSupplierComparison[];
};

export type ProductSupplierSummary = {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
  confirmedCostCount: number;
  confirmedCostRate: number;
  latestImportAt?: string;
};

export type ProductSupplierProduct = {
  id: string;
  supplierId: string;
  rawName: string;
  rawSpec?: string;
  rawUnit?: string;
  latestCost?: number;
  costConfirmed: boolean;
  lastSeenDate?: string;
  matchedCatalogId?: string;
  matchedCatalogName?: string;
};

export type ProductSupplierCostHistory = {
  id: string;
  supplierProductId: string;
  supplierId: string;
  productName: string;
  priceDate: string;
  purchasePrice: number;
};

export type ProductSupplierImport = {
  id: string;
  supplierId: string;
  fileName: string;
  status: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  excludedCount: number;
  createdAt: string;
  completedAt?: string;
};

export type ProductSupplierComparison = {
  catalogId: string;
  catalogName: string;
  offers: Array<{ supplierId: string; supplierName: string; cost: number; observedAt?: string }>;
};

export async function listProductSupplierDirectory(companyId: string): Promise<ProductSupplierDirectory> {
  const [supplierRows, productRows, matchRows, catalogRows, historyRows, importRows] = await Promise.all([
    supabaseRequest<Array<{ id: string; name: string; is_active: boolean }>>(
      `product_suppliers?select=id,name,is_active&company_id=eq.${enc(companyId)}&order=name`
    ),
    supabaseRequest<Array<{ id: string; supplier_id: string; raw_name: string; raw_spec: string | null; raw_unit: string | null; latest_cost: number | null; cost_confirmed: boolean; last_seen_date: string | null }>>(
      `supplier_products?select=id,supplier_id,raw_name,raw_spec,raw_unit,latest_cost,cost_confirmed,last_seen_date&company_id=eq.${enc(companyId)}&order=updated_at.desc&limit=5000`
    ),
    supabaseRequest<Array<{ supplier_product_id: string; product_catalog_id: string }>>(
      `supplier_product_matches?select=supplier_product_id,product_catalog_id&company_id=eq.${enc(companyId)}&match_status=in.(auto,confirmed)&limit=5000`
    ),
    supabaseRequest<Array<{ id: string; canonical_name: string | null; purchase_product_name: string }>>(
      `product_catalog?select=id,canonical_name,purchase_product_name&company_id=eq.${enc(companyId)}&limit=5000`
    ),
    supabaseRequest<Array<{ id: string; supplier_product_id: string; price_date: string; purchase_price: number }>>(
      `supplier_product_cost_history?select=id,supplier_product_id,price_date,purchase_price&company_id=eq.${enc(companyId)}&order=price_date.desc,created_at.desc&limit=5000`
    ),
    supabaseRequest<Array<{ id: string; supplier_id: string; file_name: string; status: string; total_rows: number; created_count: number; updated_count: number; excluded_count: number; created_at: string; completed_at: string | null }>>(
      `product_catalog_imports?select=id,supplier_id,file_name,status,total_rows,created_count,updated_count,excluded_count,created_at,completed_at&company_id=eq.${enc(companyId)}&order=created_at.desc&limit=1000`
    )
  ]);

  const supplierNames = new Map(supplierRows.map((row) => [row.id, row.name]));
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const catalogNames = new Map(catalogRows.map((row) => [row.id, row.canonical_name || row.purchase_product_name]));
  const matchByProduct = new Map(matchRows.map((row) => [row.supplier_product_id, row.product_catalog_id]));
  const latestImportBySupplier = new Map<string, string>();
  for (const row of importRows) if (!latestImportBySupplier.has(row.supplier_id)) latestImportBySupplier.set(row.supplier_id, row.completed_at || row.created_at);

  const products = productRows.map((row) => {
    const catalogId = matchByProduct.get(row.id);
    return {
      id: row.id,
      supplierId: row.supplier_id,
      rawName: row.raw_name,
      rawSpec: row.raw_spec || undefined,
      rawUnit: row.raw_unit || undefined,
      latestCost: row.latest_cost == null ? undefined : Number(row.latest_cost),
      costConfirmed: row.cost_confirmed,
      lastSeenDate: row.last_seen_date || undefined,
      matchedCatalogId: catalogId,
      matchedCatalogName: catalogId ? catalogNames.get(catalogId) : undefined
    } satisfies ProductSupplierProduct;
  });

  const productCounts = new Map<string, number>();
  const confirmedCounts = new Map<string, number>();
  for (const product of products) {
    productCounts.set(product.supplierId, (productCounts.get(product.supplierId) || 0) + 1);
    if (product.costConfirmed) confirmedCounts.set(product.supplierId, (confirmedCounts.get(product.supplierId) || 0) + 1);
  }

  const comparisonMap = new Map<string, ProductSupplierComparison>();
  for (const product of products) {
    if (!product.matchedCatalogId || !product.matchedCatalogName || !product.costConfirmed || product.latestCost == null) continue;
    const current = comparisonMap.get(product.matchedCatalogId) || { catalogId: product.matchedCatalogId, catalogName: product.matchedCatalogName, offers: [] };
    current.offers.push({ supplierId: product.supplierId, supplierName: supplierNames.get(product.supplierId) || "매입처 미확인", cost: product.latestCost, observedAt: product.lastSeenDate });
    comparisonMap.set(product.matchedCatalogId, current);
  }

  return {
    suppliers: supplierRows.map((row) => {
      const count = productCounts.get(row.id) || 0;
      const confirmed = confirmedCounts.get(row.id) || 0;
      return { id: row.id, name: row.name, isActive: row.is_active, productCount: count, confirmedCostCount: confirmed, confirmedCostRate: count ? Math.round((confirmed / count) * 100) : 0, latestImportAt: latestImportBySupplier.get(row.id) };
    }),
    products,
    costHistory: historyRows.flatMap((row) => {
      const product = productById.get(row.supplier_product_id);
      return product ? [{ id: row.id, supplierProductId: row.supplier_product_id, supplierId: product.supplier_id, productName: product.raw_name, priceDate: row.price_date, purchasePrice: Number(row.purchase_price) }] : [];
    }),
    imports: importRows.map((row) => ({ id: row.id, supplierId: row.supplier_id, fileName: row.file_name, status: row.status, totalRows: row.total_rows, createdCount: row.created_count, updatedCount: row.updated_count, excludedCount: row.excluded_count, createdAt: row.created_at, completedAt: row.completed_at || undefined })),
    comparisons: Array.from(comparisonMap.values()).filter((row) => new Set(row.offers.map((offer) => offer.supplierId)).size > 1)
  };
}
