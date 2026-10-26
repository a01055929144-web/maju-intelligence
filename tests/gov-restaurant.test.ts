import { describe, expect, it, vi } from "vitest";
import { fetchGovPageWithRetry, fetchGovPagesWithRetry } from "../lib/gov-restaurant";

describe("fetchGovPageWithRetry", () => {
  it("retries the required first page exactly once", async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce("page-1");

    await expect(fetchGovPageWithRetry(1, loader)).resolves.toBe("page-1");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenNthCalledWith(1, 1);
    expect(loader).toHaveBeenNthCalledWith(2, 1);
  });

  it("fails the run after the required first page fails twice", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("persistent failure"));

    await expect(fetchGovPageWithRetry(1, loader)).rejects.toThrow("persistent failure");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("fetchGovPagesWithRetry", () => {
  it("retries a failed page once and keeps the recovered page", async () => {
    const attempts = new Map<number, number>();
    const result = await fetchGovPagesWithRetry([2, 3], async (pageNo) => {
      const attempt = (attempts.get(pageNo) || 0) + 1;
      attempts.set(pageNo, attempt);
      if (pageNo === 2 && attempt === 1) throw new Error("temporary failure");
      return `page-${pageNo}`;
    });

    expect(attempts.get(2)).toBe(2);
    expect(result.pages.map((page) => page.pageNo)).toEqual([2, 3]);
    expect(result.skippedPages).toEqual([]);
  });

  it("skips only the page that still fails after the retry", async () => {
    const loader = vi.fn(async (pageNo: number) => {
      if (pageNo === 4) throw new Error("persistent failure");
      return `page-${pageNo}`;
    });

    const result = await fetchGovPagesWithRetry([3, 4, 5], loader);

    expect(loader).toHaveBeenCalledTimes(4);
    expect(result.pages.map((page) => page.pageNo)).toEqual([3, 5]);
    expect(result.skippedPages).toEqual([4]);
  });
});
