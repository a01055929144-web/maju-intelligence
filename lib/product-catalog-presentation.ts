type ProductPrices = {
  purchasePrice: number;
  salesPrice?: number;
};

export function productCatalogMargin(item: ProductPrices) {
  return item.salesPrice != null && item.purchasePrice > 0
    ? ((item.salesPrice - item.purchasePrice) / item.purchasePrice) * 100
    : undefined;
}
