export type PurchaseScreenCandidate = { cost: number; reviewOnly?: boolean };

/** The upload comparison always uses the catalog's current purchase price. */
export function currentPurchaseDelta(current: number, candidate?: PurchaseScreenCandidate) {
  if (!candidate || candidate.reviewOnly || !Number.isFinite(candidate.cost) || candidate.cost <= 0) return null;
  const amount = candidate.cost - current;
  return { amount, rate: current > 0 ? Math.round(amount / current * 1000) / 10 : null };
}

export function purchaseCandidateCounts<T extends { id: string; cost: number }>(products: readonly T[], candidates: Readonly<Record<string, PurchaseScreenCandidate>>) {
  return products.reduce((counts, product) => {
    const candidate = candidates[product.id];
    const delta = currentPurchaseDelta(product.cost, candidate);
    if (candidate?.reviewOnly) counts.review++;
    else if (delta && delta.amount > 0) counts.up++;
    else if (delta && delta.amount < 0) counts.down++;
    counts.changed = counts.up + counts.down + counts.review;
    return counts;
  }, { changed: 0, up: 0, down: 0, review: 0 });
}

/** Only equal source/sales units can be acknowledged in bulk; a different unit still needs a conversion contract. */
export function sameUnitPurchaseGroups<T extends { rowNumber: number; productId?: string; supplier: string; unit: string }>(lines: readonly T[], salesUnits: ReadonlyMap<string, string>) {
  const groups = new Map<string, number[]>();
  for (const line of lines) {
    const unit = line.unit.trim().toLocaleLowerCase("ko");
    if (!line.productId || !unit || unit !== salesUnits.get(line.productId)?.trim().toLocaleLowerCase("ko")) continue;
    const key = JSON.stringify([line.supplier, line.productId, unit]);
    groups.set(key, [...(groups.get(key) || []), line.rowNumber]);
  }
  return Array.from(groups, ([key, rows]) => ({ key, rows }));
}
