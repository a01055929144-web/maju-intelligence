import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFieldRecordForm } from "../domains/field-record/field-record";

const mocks = vi.hoisted(() => ({ session: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }), redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCustomerSession: mocks.session }));
vi.mock("@/components/mobile-location-reporter", () => ({ MobileLocationReporter: ({ autoStart }: { autoStart?: boolean }) => <div data-autostart={String(Boolean(autoStart))} data-testid="reporter" /> }));

import { FieldRecordPanel } from "../components/field-record-panel";
import MobileFieldPage from "../app/mobile/field/page";

const company = "11111111-1111-1111-1111-111111111111";
const customer = "33333333-3333-3333-3333-333333333333";

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

  it("폼 조립: 서버 API와 같은 필드, 비치 자료는 비치일 때만, 사진·영상·길이 포함", () => {
    const photo = new File([new Uint8Array(3)], "a.jpg", { type: "image/jpeg" });
    const video = new File([new Uint8Array(3)], "v.mp4", { type: "video/mp4" });
    const base = { accuracyM: 8.2, capturedAt: "2026-11-24T05:00:00.000Z", idempotencyKey: "fr-abc12345", latitude: 37.5, longitude: 127, photos: [photo], placementTypes: ["price_sheet", "quote"] as const };
    const placement = buildFieldRecordForm({ ...base, customerId: customer, kind: "placement", memo: "  문 앞  ", video: { durationSeconds: 12.5, file: video } });
    expect(placement.get("kind")).toBe("placement");
    expect(placement.getAll("placementTypes")).toEqual(["price_sheet", "quote"]);
    expect(placement.get("customerId")).toBe(customer); expect(placement.get("leadId")).toBeNull();
    expect(placement.get("memo")).toBe("문 앞");
    expect(placement.get("latitude")).toBe("37.5"); expect(placement.get("accuracyM")).toBe("8.2"); expect(placement.get("idempotencyKey")).toBe("fr-abc12345");
    expect(placement.getAll("media")).toHaveLength(2); expect(placement.get("videoDurationSeconds")).toBe("12.5");
    const visit = buildFieldRecordForm({ ...base, kind: "visit", leadId: customer });
    expect(visit.getAll("placementTypes")).toEqual([]); // 방문에는 비치 자료를 보내지 않음
    expect(visit.get("leadId")).toBe(customer); expect(visit.get("memo")).toBeNull(); expect(visit.get("videoDurationSeconds")).toBeNull();
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
