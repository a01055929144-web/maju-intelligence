export async function readCappedPages<T>(
  fetchPage: (offset: number) => Promise<T[]>,
  maximumRows: number
) {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchPage(offset);
    if (!page.length) return rows;
    if (rows.length + page.length > maximumRows) {
      throw new Error("StoreAreaProfileRowLimitExceeded");
    }
    rows.push(...page);
    offset += page.length;
  }
}
