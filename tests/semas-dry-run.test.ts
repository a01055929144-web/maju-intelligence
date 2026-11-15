import { describe, expect, it } from "vitest";
import { getSemasServiceKey, parseSemasResponse } from "../lib/semas";
import { runSemasDongDryRun, runSemasDryRun, type SemasDryRunLead } from "../lib/semas-dry-run";
import { semasRegion } from "../domains/lead/semas-match";

// 가짜 응답·가짜 키만 사용한다.
const item = { bizesId: "B1", bizesNm: "가짜분식", brchNm: "", indsLclsNm: "음식", indsMclsNm: "분식", indsSclsNm: "김밥/만두/분식", indsSclsCd: "I21201", rdnmAdr: "서울 가짜구 가짜로 1", lon: "127.0001", lat: "37.5001" };
const lead = (over: Partial<SemasDryRunLead>): SemasDryRunLead => ({ id: "L1", business_name: "가짜분식", address: "서울 가짜구 가짜로 1", latitude: "37.5", longitude: "127.0", industry_primary: "기타", status: "신규", permit_status: "영업/정상", ...over });

describe("상가정보 응답 해석", () => {
  it("items 배열·items.item 배열 모두 읽고 숫자 좌표로 바꾼다", () => {
    expect(parseSemasResponse({ header: { resultCode: "00" }, body: { items: [item] } }).stores[0]).toMatchObject({ id: "B1", lat: 37.5001, lng: 127.0001, industrySmall: "김밥/만두/분식" });
    expect(parseSemasResponse({ header: { resultCode: "00" }, body: { items: { item: [item] } } }).stores).toHaveLength(1);
  });
  it("정상 코드가 아니면 빈 목록 + 코드", () => {
    expect(parseSemasResponse({ header: { resultCode: "30" }, body: { items: [item] } })).toEqual({ resultCode: "30", stores: [] });
    expect(parseSemasResponse(null).stores).toEqual([]);
  });
  it("키: DATA_GO_KR_SERVICE_KEY 우선, 자리표시 값은 없음", () => {
    expect(getSemasServiceKey({ DATA_GO_KR_SERVICE_KEY: "fake-a", GOV_RESTAURANT_API_KEY: "fake-b" })).toBe("fake-a");
    expect(getSemasServiceKey({ GOV_RESTAURANT_API_KEY: "fake-b" })).toBe("fake-b");
    expect(getSemasServiceKey({ DATA_GO_KR_SERVICE_KEY: "replace-with-key" })).toBe("");
  });
});

describe("좌표 없는 리드 행정동 dry-run", () => {
  it("주소에서 행정구역을 읽고 같은 동은 한 번만 조회한다", async () => {
    expect(semasRegion("서울특별시 가짜구 가짜로 1 (가짜동)")).toEqual({ province: "서울특별시", district: "가짜구", dong: "가짜동" });
    let fetches = 0;
    const targets = [
      lead({ id: "a", address: "서울특별시 가짜구 가짜로 1 (가짜동)", latitude: null, longitude: null }),
      lead({ id: "b", address: "서울특별시 가짜구 가짜로 1 (가짜동)", latitude: null, longitude: null })
    ];
    const report = await runSemasDongDryRun(targets, 10, async () => {
      fetches += 1;
      return { status: "ok", httpStatus: 200, resultCode: "00", calls: 4, stores: parseSemasResponse({ header: { resultCode: "00" }, body: { items: [item] } }).stores };
    });
    expect(fetches).toBe(1);
    expect(report.api).toMatchObject({ calls: 4, ok: 1 });
    expect(report.resultCodes.filled).toBe(2);
    expect(report.fills).toEqual({ industry: 2, industryLarge: 2, industryMiddle: 2, industrySmall: 2, coords: 2 });
    expect(JSON.stringify(report)).not.toContain("가짜분식");
  });

  it("동을 알 수 없는 주소는 외부 호출 없이 주소 불일치로 센다", async () => {
    let fetches = 0;
    const report = await runSemasDongDryRun([lead({ latitude: null, longitude: null, address: "주소 형식 없음" })], 10, async () => {
      fetches += 1;
      return { status: "ok", httpStatus: 200, stores: [] };
    });
    expect(fetches).toBe(0);
    expect(report.rejectReasons).toEqual({ address_mismatch: 1 });
  });
});

describe("dry-run 집계(숫자만)", () => {
  it("폐업은 빼고, 결과 코드·채울 칸을 센다", async () => {
    const leads = [lead({ id: "L1" }), lead({ id: "L2", business_name: "다른가게" }), lead({ id: "L3", status: "폐업 확인 필요" })];
    const report = await runSemasDryRun(leads, 10, async () => ({ status: "ok", httpStatus: 200, resultCode: "00", stores: parseSemasResponse({ header: { resultCode: "00" }, body: { items: [item] } }).stores }));
    expect(report.excludedClosed).toBe(1);
    expect(report.sampled).toBe(2);
    expect(report.resultCodes).toMatchObject({ filled: 1, rejected: 1 });
    expect(report.rejectReasons).toEqual({ name_low: 1 });
    expect(report.fills).toEqual({ industry: 1, industryLarge: 1, industryMiddle: 1, industrySmall: 1, coords: 0 });
    expect(JSON.stringify(report)).not.toContain("가짜분식"); // 상호 원문 없음
  });
  it("키가 없으면 한 번만 부르고 멈춘다", async () => {
    let calls = 0;
    const report = await runSemasDryRun([lead({ id: "a" }), lead({ id: "b" }), lead({ id: "c" }), lead({ id: "d" })], 10, async () => { calls += 1; return { status: "not_configured", httpStatus: 0, stores: [] }; });
    expect(report.api.notConfigured).toBe(true);
    expect(calls).toBe(3); // 첫 묶음(3건)까지만
    expect(report.resultCodes.error).toBe(3);
  });
});
