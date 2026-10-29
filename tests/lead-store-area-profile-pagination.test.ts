import { describe, expect, it, vi } from "vitest";
import { readCappedPages } from "../lib/paginated-profile-read";

describe("store-area profile pagination", () => {
  it("continues after a server-capped short page using the actual received length", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 3 }])
      .mockResolvedValueOnce([]);

    await expect(readCappedPages(fetchPage, 30_000)).resolves.toEqual([
      { id: 1 }, { id: 2 }, { id: 3 }
    ]);
    expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([0, 2, 3]);
  });
});
