import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBusinessRegistrationStatuses, isBusinessStatusApiConfigured } from "../lib/business-status";

const originalApiKey = process.env.NTS_BUSINESS_API_KEY;
const originalServiceKey = process.env.NTS_BUSINESS_SERVICE_KEY;

afterEach(() => {
  process.env.NTS_BUSINESS_API_KEY = originalApiKey;
  process.env.NTS_BUSINESS_SERVICE_KEY = originalServiceKey;
  vi.unstubAllGlobals();
});

describe("business status API configuration", () => {
  it("treats a missing or placeholder key as not configured", () => {
    process.env.NTS_BUSINESS_API_KEY = "";
    process.env.NTS_BUSINESS_SERVICE_KEY = "";
    expect(isBusinessStatusApiConfigured()).toBe(false);

    process.env.NTS_BUSINESS_API_KEY = "replace-with-data-go-kr-service-key";
    expect(isBusinessStatusApiConfigured()).toBe(false);
  });

  it("accepts the data.go.kr service key from either supported env name", () => {
    process.env.NTS_BUSINESS_API_KEY = "";
    process.env.NTS_BUSINESS_SERVICE_KEY = "test-service-key";

    expect(isBusinessStatusApiConfigured()).toBe(true);
  });
});

describe("checkBusinessRegistrationStatuses", () => {
  it("posts normalized business numbers and maps public API status codes", async () => {
    process.env.NTS_BUSINESS_API_KEY = "test-key";
    process.env.NTS_BUSINESS_SERVICE_KEY = "";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status_code: "OK",
        request_cnt: 2,
        match_cnt: 2,
        data: [
          { b_no: "1234567890", b_stt: "계속사업자", b_stt_cd: "01", end_dt: "" },
          { b_no: "9998877776", b_stt: "폐업자", b_stt_cd: "03", end_dt: "20260731" }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkBusinessRegistrationStatuses(["123-45-67890", "999-88-77776", "짧음"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("serviceKey=test-key");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ b_no: ["1234567890", "9998877776"] });
    expect(result.get("1234567890")?.label).toBe("정상");
    expect(result.get("9998877776")?.label).toBe("폐업");
    expect(result.get("9998877776")?.closedDate).toBe("20260731");
  });

  it("returns an empty map instead of throwing when the public API fails", async () => {
    process.env.NTS_BUSINESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(checkBusinessRegistrationStatuses(["1234567890"])).resolves.toEqual(new Map());
  });
});
