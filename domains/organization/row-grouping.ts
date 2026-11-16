/** PostgREST bulk requests require every JSON object to use the same keys. */
export function groupRowsByColumnSignature(rows: Array<Record<string, unknown>>) {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const signature = Object.keys(row).sort().join(",");
    groups.set(signature, [...(groups.get(signature) || []), row]);
  }
  return Array.from(groups.values());
}
