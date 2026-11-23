/** Only positive prices different from the current catalog price become automatic current-price candidates. */
export function autoSelectCurrentPurchaseIds(
  candidates: Readonly<Record<string, { cost: number }>>,
  currentCosts: ReadonlyMap<string, number>
) {
  return Object.entries(candidates).filter(([id, candidate]) =>
    Number.isFinite(candidate.cost) && candidate.cost > 0 && candidate.cost !== currentCosts.get(id)
  ).map(([id]) => id);
}
