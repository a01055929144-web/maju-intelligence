import { buildCatalogPreview, type CatalogMapping, type ParsedProduct } from "../product/catalog-import";
import { resolveExistingSupplierName, supplierNameKey } from "./supplier-name";

export type SupplierLinkInput = { productId: string; rawName: string; spec?: string; unit?: string; cost: number; supplierName?: string };
export type SupplierLinkGroup = { supplierName: string; products: ParsedProduct[]; targetByFingerprint: Map<string, string> };

const MAPPING: CatalogMapping = { productName: "상품명", spec: "규격", unit: "단위", cost: "매입가" };

export function prepareSupplierLinkGroups(links: readonly SupplierLinkInput[], existingSupplierNames: readonly string[]): SupplierLinkGroup[] {
  const grouped = new Map<string, SupplierLinkInput[]>();
  for (const link of links) {
    const name = link.supplierName?.trim() || "기본 매입처";
    const key = supplierNameKey(name) || name;
    grouped.set(key, [...(grouped.get(key) || []), link]);
  }
  return Array.from(grouped.values()).map((items: SupplierLinkInput[]) => {
    const supplierName = resolveExistingSupplierName(items[0].supplierName?.trim() || "기본 매입처", existingSupplierNames);
    const raw = items.map((item) => ({ 단위: item.unit || "", 매입가: Number(item.cost), 상품명: item.rawName.trim(), 규격: item.spec || "" }));
    const products = buildCatalogPreview(raw, MAPPING, supplierName).products;
    const targetByFingerprint = new Map<string, string>();
    for (const item of items) {
      const [product] = buildCatalogPreview([{
        단위: item.unit || "", 매입가: Number(item.cost), 상품명: item.rawName.trim(), 규격: item.spec || ""
      }], MAPPING, supplierName).products;
      if (!product) continue;
      const previous = targetByFingerprint.get(product.sourceFingerprint);
      if (previous && previous !== item.productId) throw new Error("같은 매입처 원문이 여러 상품에 연결되어 있습니다.");
      targetByFingerprint.set(product.sourceFingerprint, item.productId);
    }
    return { supplierName, products, targetByFingerprint };
  }).filter((group) => group.products.length > 0);
}
