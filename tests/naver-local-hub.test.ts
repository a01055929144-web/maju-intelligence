import { afterEach, expect, it, vi } from "vitest";
import { searchNaverLocal } from "../lib/place-links";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const reply = (items: unknown[], ok = true, status = 200) => vi.fn(async () => ({ ok, status, json: async () => ({ items }) }));

it("키가 없으면 호출 없이 error", async () => {
  vi.stubEnv("NCP_DATALAB_CLIENT_ID", ""); vi.stubEnv("NCP_DATALAB_CLIENT_SECRET", "");
  const f = reply([]); vi.stubGlobal("fetch", f);
  expect(await searchNaverLocal("가짜상점")).toMatchObject({ result: "error", configured: false });
  expect(f).not.toHaveBeenCalled();
});

it("API HUB 주소·헤더로 호출하고 map.naver.com 링크만 linked", async () => {
  vi.stubEnv("NCP_DATALAB_CLIENT_ID", "id"); vi.stubEnv("NCP_DATALAB_CLIENT_SECRET", "secret");
  const f = reply([{ link: "https://map.naver.com/p/entry/place/1" }]); vi.stubGlobal("fetch", f);
  expect(await searchNaverLocal("가짜상점")).toMatchObject({ result: "linked", link: "https://map.naver.com/p/entry/place/1" });
  const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
  expect(url).toContain("naverapihub.apigw.ntruss.com/search/v1/local");
  expect(init.headers["X-NCP-APIGW-API-KEY-ID"]).toBe("id");
});

it("홈페이지 링크·0건은 not_found, HTTP 실패는 error", async () => {
  vi.stubEnv("NCP_DATALAB_CLIENT_ID", "id"); vi.stubEnv("NCP_DATALAB_CLIENT_SECRET", "secret");
  vi.stubGlobal("fetch", reply([{ link: "https://example.com" }]));
  expect((await searchNaverLocal("가짜상점")).result).toBe("not_found");
  vi.stubGlobal("fetch", reply([]));
  expect((await searchNaverLocal("가짜상점")).result).toBe("not_found");
  vi.stubGlobal("fetch", reply([], false, 401));
  expect(await searchNaverLocal("가짜상점")).toMatchObject({ result: "error", status: 401 });
});
