export type DocumentRecalculation = {
  publishedAt: string | null;
  needsRecalculation: boolean;
  changedProductCount: number;
};
export type ProductPriceChange = { productId: string; changedAt: string };

// PostgreSQL stores microseconds; Date.parse alone loses changes in the same millisecond.
function instant(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("가격 이력 시각을 확인하지 못했습니다.");
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] || "";
  return BigInt(milliseconds) * BigInt(1000) + BigInt(fraction.padEnd(6, "0").slice(3, 6));
}

/** Publication is the acknowledgement: editing/recalculating a draft cannot clear it. */
export function documentRecalculation(
  published: { publishedAt: string; productIds: string[] } | undefined,
  changes: ProductPriceChange[],
): DocumentRecalculation {
  if (!published) return { publishedAt: null, needsRecalculation: false, changedProductCount: 0 };
  const at = instant(published.publishedAt);
  const ids = new Set(published.productIds);
  const changed = new Set<string>();
  for (const change of changes) {
    const time = instant(change.changedAt);
    if (time > at && ids.has(change.productId)) changed.add(change.productId);
  }
  return { publishedAt: published.publishedAt, needsRecalculation: changed.size > 0, changedProductCount: changed.size };
}

export function changedCostEvents(rows: { purchase_price: number; created_at: string; id: string }[], baseline?: number) {
  let previous = baseline;
  return [...rows].sort((a, b) => instant(a.created_at) < instant(b.created_at) ? -1 : instant(a.created_at) > instant(b.created_at) ? 1 : a.id.localeCompare(b.id)).filter(row => {
    const changed = previous === undefined || Number(row.purchase_price) !== Number(previous);
    previous = row.purchase_price;
    return changed;
  });
}
