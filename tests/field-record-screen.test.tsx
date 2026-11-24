import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resizedSize, submitFieldRecord } from "../lib/field-records/client";

const mocks = vi.hoisted(() => ({ session: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }), redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCustomerSession: mocks.session }));
vi.mock("@/components/mobile-location-reporter", () => ({ MobileLocationReporter: ({ autoStart }: { autoStart?: boolean }) => <div data-autostart={String(Boolean(autoStart))} data-testid="reporter" /> }));

import { FieldRecordPanel } from "../components/field-record-panel";
import MobileFieldPage from "../app/mobile/field/page";

const company = "11111111-1111-1111-1111-111111111111";
const customer = "33333333-3333-3333-3333-333333333333";
const MB = 1024 * 1024;
const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });

describe("CX-135 [현장 기록] 화면", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("처음 화면: 종류 3개(배송완료 없음)·사진/영상·위치·저장 버튼은 위치 확인 전이라 비활성, 사진 없으면 방문 인정 안 됨 안내", () => {
    const html = renderToStaticMarkup(<FieldRecordPanel customerId={customer} targetName="합성 매장" />);
    for (const text of ["현장 기록", "대상: 합성 매장", "방문", "비치", "전단지", "사진 찍기·선택", "영상(선택 · 30초)", "위치 다시 확인", "기록 저장"]) expect(html).toContain(text);
    expect(html).not.toContain("배송완료");
    expect(html).toContain("사진 1장 이상이어야 방문으로 인정됩니다");
    expect(html).toContain("사진이 없으면 저장은 되지만 방문으로 인정되지 않습니다");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>기록 저장/); // 위치 전에는 저장 불가
    expect(html).not.toContain("비치한 자료(1개 이상)"); // 비치를 고른 뒤에만 자료 선택
    expect(renderToStaticMarkup(<FieldRecordPanel />)).toContain("대상: 지금 있는 위치(지도 위치)");
  });

  it("사진 줄이기: 긴 변이 1600px을 넘을 때만 비율대로 줄이고 키우지 않는다", () => {
    expect(resizedSize(4000, 3000)).toEqual({ height: 1200, width: 1600 });
    expect(resizedSize(3000, 4000)).toEqual({ height: 1600, width: 1200 });
    expect(resizedSize(1600, 900)).toEqual({ height: 900, width: 1600 });
    expect(resizedSize(800, 600)).toEqual({ height: 600, width: 800 });
    expect(resizedSize(8000, 10)).toEqual({ height: 2, width: 1600 });
  });

  describe("업로드 흐름: 파일은 저장소로 직접, 기록 요청에는 경로만", () => {
    const base = { accuracyM: 8.2, capturedAt: "2026-11-24T05:00:00.000Z", customerId: customer, idempotencyKey: "fr-abc12345", kind: "placement" as const, latitude: 37.5, longitude: 127, memo: " 문 앞 ", placementTypes: ["price_sheet", "quote"] as const };
    const folder = `${company}/field-records/abc`;
    function fakeFetch(options: { putStatus?: number; recordStatus?: number; signStatus?: number } = {}) {
      return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target === "/api/field-records/upload-urls") {
          if (options.signStatus) return new Response(JSON.stringify({ message: "사진은 8MB 이하만 올릴 수 있습니다." }), { status: options.signStatus });
          const files = JSON.parse(String(init?.body)).files as Array<{ mimeType: string }>;
          return Response.json({ uploads: files.map((item, index) => ({ index, path: `${folder}/${index}.${item.mimeType === "video/mp4" ? "mp4" : "jpg"}`, uploadUrl: `https://sb.test/storage/v1/object/upload/sign/customer-attachments/${folder}/${index}?token=t` })) });
        }
        if (target.startsWith("https://sb.test/")) return new Response("{}", { status: options.putStatus ?? 200 });
        if (target === "/api/field-records") return options.recordStatus ? new Response(JSON.stringify({ message: "대상 매장을 확인해 주세요." }), { status: options.recordStatus }) : Response.json({ countsAsVisit: true, id: "rec-1", reused: false });
        throw new Error(`unexpected ${target}`);
      });
    }

    it("5MB 사진 2장 + 40MB 영상: /api 요청은 작은 JSON뿐이고 파일 바이트는 저장소 주소로만 간다", async () => {
      const photos = [file("a.jpg", "image/jpeg", 5 * MB), file("b.jpg", "image/jpeg", 5 * MB)];
      const video = file("v.mp4", "video/mp4", 40 * MB);
      const fetchImpl = fakeFetch();
      const result = await submitFieldRecord({ ...base, photos, video: { durationSeconds: 28, file: video } }, fetchImpl as unknown as typeof fetch);
      expect(result).toEqual({ countsAsVisit: true, id: "rec-1", reused: false });
      const calls = fetchImpl.mock.calls.map(([url, init]) => ({ body: init?.body, method: init?.method, url: String(url) }));
      expect(calls.map((call) => `${call.method} ${call.url.startsWith("https://sb.test") ? "STORAGE" : call.url}`)).toEqual([
        "POST /api/field-records/upload-urls", "PUT STORAGE", "PUT STORAGE", "PUT STORAGE", "POST /api/field-records"]);
      for (const call of calls.filter((item) => item.url.startsWith("/api"))) { expect(typeof call.body).toBe("string"); expect(String(call.body).length).toBeLessThan(2000); } // 4.5MB와 무관
      expect(calls.filter((item) => item.method === "PUT").map((item) => (item.body as File).size)).toEqual([5 * MB, 5 * MB, 40 * MB]);
      expect(JSON.parse(String(calls[0].body))).toEqual({ files: [{ mimeType: "image/jpeg", size: 5 * MB }, { mimeType: "image/jpeg", size: 5 * MB }, { durationSeconds: 28, mimeType: "video/mp4", size: 40 * MB }], idempotencyKey: "fr-abc12345" });
      const record = JSON.parse(String(calls[4].body));
      expect(record).toMatchObject({ customerId: customer, idempotencyKey: "fr-abc12345", kind: "placement", memo: "문 앞", placementTypes: ["price_sheet", "quote"] });
      expect(record.media.map((item: { path: string }) => item.path)).toEqual([`${folder}/0.jpg`, `${folder}/1.jpg`, `${folder}/2.mp4`]);
      expect(record.media[2]).toMatchObject({ durationSeconds: 28, mimeType: "video/mp4", size: 40 * MB });
      expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT").every(([, init]) => (init?.headers as Record<string, string>)["x-upsert"] === "true")).toBe(true);
    });

    it("사진 없이 기록하면 업로드 주소를 요청하지 않고, 방문·전단지에는 비치 자료를 보내지 않는다", async () => {
      const fetchImpl = fakeFetch();
      await submitFieldRecord({ ...base, kind: "visit", leadId: customer, customerId: null, photos: [] }, fetchImpl as unknown as typeof fetch);
      expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual(["/api/field-records"]);
      const record = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
      expect(record.placementTypes).toEqual([]); expect(record.media).toEqual([]); expect(record.leadId).toBe(customer); expect(record.customerId).toBeUndefined();
    });

    it("실패하면 기록 요청까지 가지 않고 서버 안내 문구를 그대로 보여 주며, 같은 식별값으로 다시 시도할 수 있다", async () => {
      const photos = [file("a.jpg", "image/jpeg", 100)];
      const refused = fakeFetch({ signStatus: 400 });
      await expect(submitFieldRecord({ ...base, photos }, refused as unknown as typeof fetch)).rejects.toThrow("사진은 8MB 이하만 올릴 수 있습니다.");
      expect(refused).toHaveBeenCalledTimes(1);
      const brokenPut = fakeFetch({ putStatus: 500 });
      await expect(submitFieldRecord({ ...base, photos }, brokenPut as unknown as typeof fetch)).rejects.toThrow("1번째 파일을 올리지 못했습니다");
      expect(brokenPut.mock.calls.some(([url]) => String(url) === "/api/field-records")).toBe(false); // 업로드가 실패하면 기록하지 않음
      const rejected = fakeFetch({ recordStatus: 400 });
      await expect(submitFieldRecord({ ...base, photos }, rejected as unknown as typeof fetch)).rejects.toThrow("대상 매장을 확인해 주세요.");
      const retry = fakeFetch();
      await submitFieldRecord({ ...base, photos }, retry as unknown as typeof fetch);
      expect(JSON.parse(String(retry.mock.calls[0][1]?.body)).idempotencyKey).toBe("fr-abc12345"); // 재시도도 같은 식별값
    });
  });

  it("화면 입구: 로그인 없으면 가입 화면으로, 플래그 OFF·allowlist 밖이면 404, 열리면 위치 자동 전송과 기록 패널", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(MobileFieldPage({})).rejects.toThrow("REDIRECT:/mobile/join");
    mocks.session.mockResolvedValue({ companyId: company, userId: "u1" });
    await expect(MobileFieldPage({})).rejects.toThrow("NOT_FOUND"); // 기본 OFF
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", "other-company");
    await expect(MobileFieldPage({})).rejects.toThrow("NOT_FOUND");
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", company);
    const html = renderToStaticMarkup(await MobileFieldPage({ searchParams: Promise.resolve({ customerId: customer, name: "합성 매장", leadId: "not-a-uuid" }) }));
    expect(html).toContain('data-autostart="true"'); expect(html).toContain("대상: 합성 매장"); expect(html).toContain("기록 저장");
  });
});
