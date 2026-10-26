import { describe, expect, it } from "vitest";
import { runBulkActions } from "./bulk-actions";

describe("runBulkActions", () => {
  it("keeps 50 requests within the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const outcomes = await runBulkActions(Array.from({ length: 50 }, (_, index) => index), async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return item * 2;
    }, 4);

    expect(peak).toBeLessThanOrEqual(4);
    expect(outcomes).toHaveLength(50);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  });

  it("preserves failed items for targeted retry", async () => {
    const outcomes = await runBulkActions(["a", "b", "c", "d"], async (item) => {
      if (item === "b" || item === "d") throw new Error("failed");
      return `${item}-saved`;
    }, 3);

    expect(outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.item)).toEqual(["b", "d"]);
    expect(outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.item)).toEqual(["a", "c"]);
  });
});
