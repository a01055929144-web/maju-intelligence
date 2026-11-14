import { kstDateKey } from "../shared/kst-date";

export function isConsecutiveDailyZeroFetch(input: {
  currentStartedAt: string;
  currentFetched: number;
  previousStartedAt?: string | null;
  previousFetched?: number | null;
  previousStatus?: string | null;
}) {
  if (input.currentFetched !== 0 || input.previousFetched !== 0 || input.previousStatus !== "success") return false;
  const currentKey = kstDateKey(input.currentStartedAt);
  const previousKey = kstDateKey(input.previousStartedAt || "");
  if (!currentKey || !previousKey) return false;
  const expectedPrevious = new Date(`${currentKey}T00:00:00.000Z`);
  expectedPrevious.setUTCDate(expectedPrevious.getUTCDate() - 1);
  return previousKey === expectedPrevious.toISOString().slice(0, 10);
}
