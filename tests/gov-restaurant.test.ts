import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGovAreaRows, fetchGovPageWithRetry, fetchGovPagesWithRetry } from "../lib/gov-restaurant";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("government API failures", () => {
  it("reports an upstream 403 result without exposing the service key", async () => {
    vi.stubEnv("GOV_RESTAURANT_API_KEY", "private-key");
    const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      response: { header: { resultCode: "SERVICE_ACCESS_DENIED_ERROR", resultMsg: "serviceKey=private-key denied" } }
    }), { status: 403 }));
    vi.stubGlobal("fetch", request);

    const error = await fetchGovAreaRows({
      dataset: "general_restaurants",
      areaCode: "3220000",
      maxPages: 1
    }).catch((failure: Error) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("SERVICE_ACCESS_DENIED_ERROR");
    expect(String(error)).not.toContain("private-key");
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[0][0])).toContain("OPN_ATMY_GRP_CD");
  });

  it("첫 적재는 시군구와 영업 중 조건을 함께 보낸다", async () => {
    vi.stubEnv("GOV_RESTAURANT_API_KEY", "private-key");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: { header: { resultCode: "00" }, body: { totalCount: 0, items: { item: [] } } }
    }), { status: 200 }));
    vi.stubGlobal("fetch", request);

    await fetchGovAreaRows({ dataset: "rest_cafes", areaCode: "3220000", maxPages: 1, activeOnly: true });

    const url = request.mock.calls[0][0] as URL;
    expect(url.searchParams.get("cond[OPN_ATMY_GRP_CD::EQ]")).toBe("3220000");
    expect(url.searchParams.get("cond[SALS_STTS_CD::EQ]")).toBe("01");
  });
});

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

describe("isGovSuccessResultCode", () => {
  it("treats the 1741000 API normal code \"0\" and legacy \"00\" as success", async () => {
    const { isGovSuccessResultCode } = await import("../lib/gov-restaurant");
    expect(isGovSuccessResultCode("0")).toBe(true);
    expect(isGovSuccessResultCode("00")).toBe(true);
    expect(isGovSuccessResultCode(undefined)).toBe(true);
  });
  it("treats error codes as failure", async () => {
    const { isGovSuccessResultCode } = await import("../lib/gov-restaurant");
    expect(isGovSuccessResultCode("30")).toBe(false);
    expect(isGovSuccessResultCode("22")).toBe(false);
    expect(isGovSuccessResultCode("INFO-200")).toBe(false);
  });
});
