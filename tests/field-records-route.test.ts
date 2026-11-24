import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countsAsVisit, parseFieldRecord, validateFieldMedia } from "../domains/field-record/field-record";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), capability: vi.fn(), db: vi.fn(), sign: vi.fn(), storage: vi.fn(), scoped: vi.fn()
}));
vi.mock("@/lib/auth", () => ({
  getRequestAuthScope: mocks.auth, getCustomerAssignmentKeys: () => ["assign-1"], getCustomerOperationalName: () => "합성 알바",
  scopeHasCapability: mocks.capability, shouldScopeCustomerData: mocks.scoped
}));
vi.mock("@/lib/store", () => ({
  canAccessAssignedCustomer: mocks.access, createCustomerAttachmentSignedUrl: mocks.sign, CUSTOMER_ATTACHMENT_BUCKET: "customer-attachments",
  supabaseRequest: mocks.db, supabaseStorageRequest: mocks.storage
}));

import { GET, POST } from "../app/api/field-records/route";

const company = "11111111-1111-1111-1111-111111111111";
const user = "22222222-2222-2222-2222-222222222222";
const customer = "33333333-3333-3333-3333-333333333333";
const base = { accuracyM: "12.34", capturedAt: new Date().toISOString(), idempotencyKey: "idem-key-0001", kind: "placement", latitude: "37.5665", longitude: "126.978" };

function post(fields: Record<string, string | string[]>, files: File[] = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  for (const file of files) form.append("media", file);
  return new NextRequest("https://fixture.test/api/field-records", { method: "POST", body: form });
}
const photo = (name = "a.jpg", size = 100) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

describe("CX-135 현장 기록 도메인 규칙", () => {
  it("종류·비치 자료·좌표·시각·메모·식별값을 검증한다", () => {
    expect(parseFieldRecord({ ...base, placementTypes: ["price_sheet", "catalog"] })).toMatchObject({ ok: true, value: { accuracyM: 12.3, kind: "placement", placementTypes: ["price_sheet", "catalog"] } });
    expect(parseFieldRecord({ ...base, kind: "delivery" }).ok).toBe(false); // 배송완료는 기존 표
    expect(parseFieldRecord({ ...base, placementTypes: [] }).ok).toBe(false); // 비치는 자료 필수
    expect(parseFieldRecord({ ...base, kind: "visit", placementTypes: ["quote"] }).ok).toBe(false);
    expect(parseFieldRecord({ ...base, kind: "flyer", placementTypes: [] }).ok).toBe(true);
    expect(parseFieldRecord({ ...base, kind: "visit", latitude: "91" }).ok).toBe(false);
    expect(parseFieldRecord({ ...base, kind: "visit", accuracyM: "" }).ok).toBe(false);
    expect(parseFieldRecord({ ...base, kind: "visit", capturedAt: new Date(Date.now() + 3_600_000).toISOString() }).ok).toBe(false);
    expect(parseFieldRecord({ ...base, kind: "visit", capturedAt: new Date(Date.now() - 48 * 3_600_000).toISOString() }).ok).toBe(false);
    expect(parseFieldRecord({ ...base, kind: "visit", memo: "가".repeat(501) }).ok).toBe(false);
    expect(parseFieldRecord({ ...base, kind: "visit", idempotencyKey: "짧음" }).ok).toBe(false);
    expect(parseFieldRecord({ ...base, kind: "visit", customerId: "not-a-uuid" }).ok).toBe(false);
  });

  it("사진 8MB·영상 50MB·30초·영상 1개·전체 10개, 사진 1장 이상이어야 방문 인정", () => {
    const ok = validateFieldMedia([{ mimeType: "image/jpeg", size: 8 * 1024 * 1024 }, { durationSeconds: 30, mimeType: "video/mp4", size: 50 * 1024 * 1024 }]);
    expect(ok).toMatchObject({ ok: true, photoCount: 1 });
    expect(validateFieldMedia([{ mimeType: "image/jpeg", size: 8 * 1024 * 1024 + 1 }]).ok).toBe(false);
    expect(validateFieldMedia([{ durationSeconds: 31, mimeType: "video/mp4", size: 10 }]).ok).toBe(false);
    expect(validateFieldMedia([{ mimeType: "video/mp4", size: 10 }]).ok).toBe(false); // 길이 없음
    expect(validateFieldMedia([{ durationSeconds: 5, mimeType: "video/mp4", size: 50 * 1024 * 1024 + 1 }]).ok).toBe(false);
    expect(validateFieldMedia([{ durationSeconds: 5, mimeType: "video/mp4", size: 1 }, { durationSeconds: 5, mimeType: "video/webm", size: 1 }]).ok).toBe(false);
    expect(validateFieldMedia(Array.from({ length: 11 }, () => ({ mimeType: "image/png", size: 1 }))).ok).toBe(false);
    expect(validateFieldMedia([{ mimeType: "application/pdf", size: 1 }]).ok).toBe(false);
    expect(countsAsVisit(validateFieldMedia([{ durationSeconds: 5, mimeType: "video/mp4", size: 1 }]).photoCount)).toBe(false); // 영상만
    expect(countsAsVisit(1)).toBe(true);
  });
});

describe("CX-135 /api/field-records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", company);
    mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { userId: user, companyMemberId: "member-1" } });
    mocks.scoped.mockReturnValue(false);
    mocks.capability.mockReturnValue(false);
    mocks.access.mockResolvedValue(true);
    mocks.storage.mockResolvedValue(undefined);
    mocks.sign.mockResolvedValue("https://signed.test/a");
    mocks.db.mockResolvedValue({ countsAsVisit: true, id: "rec-1", reused: false });
  });

  it("기능이 꺼져 있거나 회사가 allowlist에 없으면 404, 로그인이 없으면 401이고 DB·저장소를 건드리지 않는다", async () => {
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", "other-company");
    expect((await POST(post({ ...base, placementTypes: ["quote"] }, [photo()]))).status).toBe(404);
    expect((await GET(new NextRequest("https://fixture.test/api/field-records"))).status).toBe(404);
    vi.unstubAllEnvs();
    expect((await POST(post({ ...base, placementTypes: ["quote"] }, [photo()]))).status).toBe(404); // 기본 OFF
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", company);
    mocks.auth.mockResolvedValue({ ok: false });
    expect((await POST(post({ ...base, placementTypes: ["quote"] }, [photo()]))).status).toBe(401);
    mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: {} });
    expect((await POST(post({ ...base, placementTypes: ["quote"] }, [photo()]))).status).toBe(401); // 실제 직원 계정만
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("사진을 회사 폴더에 올리고 기록 함수를 한 번 부르며, 기록자·회사는 요청값이 아니라 세션에서 온다", async () => {
    const response = await POST(post({ ...base, companyId: "99999999-9999-9999-9999-999999999999", placementTypes: ["price_sheet", "quote"], customerId: customer }, [photo("../../evil.jpg"), photo("b.jpg")]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ countsAsVisit: true, id: "rec-1", reused: false });
    const paths = mocks.storage.mock.calls.map(([path]) => String(path));
    expect(paths).toHaveLength(2);
    for (const path of paths) expect(path).toMatch(new RegExp(`^object/customer-attachments/${company}/field-records/[0-9a-f]{32}/[01]\\.jpg$`));
    expect(mocks.storage.mock.calls[0][1]).toMatchObject({ method: "POST", headers: expect.objectContaining({ "x-upsert": "true" }) });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(mocks.db.mock.calls[0][0]).toBe("rpc/create_field_record_v1");
    expect(body).toMatchObject({ p_company_id: company, p_actor_user_id: user, p_actor_member_id: "member-1", p_kind: "placement", p_placement_types: ["price_sheet", "quote"],
      p_customer_id: customer, p_assignment_id: null, p_latitude: 37.5665, p_accuracy_m: 12.3, p_actor_name: "합성 알바" });
    expect(body.p_media.map((item: { storage_path: string }) => item.storage_path)).toEqual(paths.map((path) => path.replace("object/customer-attachments/", "")));
  });

  it("검증 실패(좌표·종류·영상 길이·미디어 형식)는 저장소와 DB를 건드리지 않고 400", async () => {
    expect((await POST(post({ ...base, latitude: "abc", placementTypes: ["quote"] }, [photo()]))).status).toBe(400);
    expect((await POST(post({ ...base, kind: "delivery" }, [photo()]))).status).toBe(400);
    const video = new File([new Uint8Array(10)], "v.mp4", { type: "video/mp4" });
    expect((await POST(post({ ...base, placementTypes: ["quote"], videoDurationSeconds: "31" }, [video]))).status).toBe(400);
    expect((await POST(post({ ...base, placementTypes: ["quote"] }, [new File(["x"], "a.pdf", { type: "application/pdf" })]))).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("영상은 길이와 함께 기록되고, 사진이 없으면 방문 인정 안 됨으로 돌려준다", async () => {
    mocks.db.mockResolvedValue({ countsAsVisit: false, id: "rec-2", reused: false });
    const video = new File([new Uint8Array(10)], "v.mp4", { type: "video/mp4" });
    const response = await POST(post({ ...base, placementTypes: ["catalog"], videoDurationSeconds: "12.5" }, [video]));
    expect(await response.json()).toMatchObject({ countsAsVisit: false });
    expect(JSON.parse(mocks.db.mock.calls[0][1].body).p_media).toEqual([expect.objectContaining({ kind: "video", duration_seconds: 12.5, mime_type: "video/mp4" })]);
  });

  it("배정되지 않은 매장은 403, 구성원이 아니면(RPC 거절) 403, 같은 키 재전송은 reused", async () => {
    mocks.scoped.mockReturnValue(true); mocks.access.mockResolvedValue(false);
    expect((await POST(post({ ...base, placementTypes: ["quote"], customerId: customer }, [photo()]))).status).toBe(403);
    expect(mocks.storage).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue(true);
    mocks.db.mockRejectedValueOnce(new Error("field_record_actor_forbidden"));
    expect((await POST(post({ ...base, placementTypes: ["quote"] }, [photo()]))).status).toBe(403);
    mocks.db.mockResolvedValueOnce({ countsAsVisit: true, id: "rec-1", reused: true });
    expect(await (await POST(post({ ...base, placementTypes: ["quote"] }, [photo()]))).json()).toMatchObject({ reused: true });
  });

  it("목록: 운영 권한이 없으면 내 기록만, 있으면 회사 전체. 사진은 서명 주소로만", async () => {
    mocks.db.mockResolvedValue([{ id: "rec-1", kind: "visit", placement_types: [], actor_user_id: user, customer_id: customer, lead_id: null, latitude: 37.5, longitude: 127, accuracy_m: 5,
      captured_at: "2026-11-24T05:00:00Z", memo: null, photo_count: 1, counts_as_visit: true,
      field_record_photos: [{ id: "p2", media_kind: "photo", storage_path: `${company}/field-records/x/1.jpg`, mime_type: "image/jpeg", sort_order: 1 }, { id: "p1", media_kind: "photo", storage_path: `${company}/field-records/x/0.jpg`, mime_type: "image/jpeg", sort_order: 0 }] }]);
    const mine = await (await GET(new NextRequest(`https://fixture.test/api/field-records?customerId=${customer}`))).json();
    expect(String(mocks.db.mock.calls[0][0])).toContain(`actor_user_id=eq.${user}`);
    expect(String(mocks.db.mock.calls[0][0])).toContain(`customer_id=eq.${customer}`);
    expect(mine.records[0].media.map((item: { id: string }) => item.id)).toEqual(["p1", "p2"]);
    expect(JSON.stringify(mine)).not.toContain("storage_path"); expect(mine.records[0].media[0].url).toBe("https://signed.test/a");
    mocks.capability.mockReturnValue(true);
    await GET(new NextRequest("https://fixture.test/api/field-records"));
    expect(String(mocks.db.mock.calls[1][0])).not.toContain("actor_user_id=eq.");
    expect((await GET(new NextRequest("https://fixture.test/api/field-records?customerId=bad"))).status).toBe(400);
  });
});
