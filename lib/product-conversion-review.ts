export function defaultConversionReviewRatio(item: { rawUnit?: string; matchedCatalogUnit?: string }) {
  const source = item.rawUnit?.trim().toLowerCase();
  const target = item.matchedCatalogUnit?.trim().toLowerCase();
  return source && target && source === target ? "1" : "";
}
