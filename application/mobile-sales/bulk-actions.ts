export type BulkActionOutcome<T, R> =
  | { item: T; ok: true; result: R }
  | { error: unknown; item: T; ok: false };

export async function runBulkActions<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  concurrency = 4
): Promise<Array<BulkActionOutcome<T, R>>> {
  if (!items.length) return [];
  const outcomes = new Array<BulkActionOutcome<T, R>>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));

  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      try {
        outcomes[index] = { item, ok: true, result: await worker(item) };
      } catch (error) {
        outcomes[index] = { error, item, ok: false };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, consume));
  return outcomes;
}
