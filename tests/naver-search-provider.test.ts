import { describe, expect, it } from "vitest";
import { buildNaverSearchRequest, resolveNaverSearchProvider } from "../lib/instagram-discovery";

// 가짜 키만 사용한다.
describe("네이버 블로그·웹문서 검색 키 선택 (API HUB 우선)", () => {
  it("API HUB 키(NCP_DATALAB_*)가 있으면 HUB를 쓴다", () => {
    const provider = resolveNaverSearchProvider({ NCP_DATALAB_CLIENT_ID: "hub-id", NCP_DATALAB_CLIENT_SECRET: "hub-secret", NAVER_SEARCH_CLIENT_ID: "dev-id", NAVER_SEARCH_CLIENT_SECRET: "dev-secret" });
    expect(provider?.kind).toBe("hub");
  });
  it("HUB 키가 없을 때만 개발자센터 키를 쓴다", () => {
    expect(resolveNaverSearchProvider({ NAVER_SEARCH_CLIENT_ID: "dev-id", NAVER_SEARCH_CLIENT_SECRET: "dev-secret" })?.kind).toBe("developers");
  });
  it("자리표시 값·한쪽만 있는 키는 없음으로 본다", () => {
    expect(resolveNaverSearchProvider({ NAVER_SEARCH_CLIENT_ID: "replace-with-naver-client-id", NAVER_SEARCH_CLIENT_SECRET: "x" })).toBeNull();
    expect(resolveNaverSearchProvider({ NCP_DATALAB_CLIENT_ID: "hub-id" })).toBeNull();
    expect(resolveNaverSearchProvider({})).toBeNull();
  });
  it("HUB 요청은 /search/v1/{종류} 와 X-NCP-APIGW 헤더", () => {
    const request = buildNaverSearchRequest({ kind: "hub", clientId: "hub-id", clientSecret: "hub-secret" }, "blog", "가짜 식당");
    expect(request.url).toBe("https://naverapihub.apigw.ntruss.com/search/v1/blog?query=%EA%B0%80%EC%A7%9C%20%EC%8B%9D%EB%8B%B9&display=20");
    expect(request.headers).toEqual({ "X-NCP-APIGW-API-KEY-ID": "hub-id", "X-NCP-APIGW-API-KEY": "hub-secret" });
  });
  it("개발자센터 요청은 예전 주소·헤더 그대로", () => {
    const request = buildNaverSearchRequest({ kind: "developers", clientId: "dev-id", clientSecret: "dev-secret" }, "webkr", "가짜");
    expect(request.url).toBe("https://openapi.naver.com/v1/search/webkr.json?query=%EA%B0%80%EC%A7%9C&display=20");
    expect(request.headers).toEqual({ "X-Naver-Client-Id": "dev-id", "X-Naver-Client-Secret": "dev-secret" });
  });
});
