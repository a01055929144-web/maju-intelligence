import { createHash } from "crypto";
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
vi.mock("@/lib/store/00-core", () => ({ getSupabaseConfig: () => ({ serviceRoleKey: "synthetic", url: "https://sb.test" }) }));

import { GET, POST } from "../app/api/field-records/route";
import { POST as UPLOAD_URLS } from "../app/api/field-records/upload-urls/route";

const company = "11111111-1111-1111-1111-111111111111";
const otherCompany = "99999999-9999-9999-9999-999999999999";
const user = "22222222-2222-2222-2222-222222222222";
const customer = "33333333-3333-3333-3333-333333333333";
const KEY = "idem-key-0001";
const MB = 1024 * 1024;
const base = { accuracyM: "12.34", capturedAt: new Date().toISOString(), idempotencyKey: KEY, kind: "placement", latitude: "37.5665", longitude: "126.978" };
const hash = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 32);
const folder = (c = company, key = KEY) => `${c}/field-records/${hash(key)}`;

const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`https://fixture.test${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const photo5 = { mimeType: "image/jpeg", size: 5 * MB };
const video40 = { durationSeconds: 28, mimeType: "video/mp4", size: 40 * MB };
const claims = (items = [photo5, photo5, video40]) => items.map((item, index) => ({ ...item, path: `${folder()}/${index}.${item.mimeType === "video/mp4" ? "mp4" : "jpg"}` }));
const listOf = (items = claims()) => items.map((item) => ({ name: item.path.slice(folder().length + 1), metadata: { mimetype: item.mimeType, size: item.size } }));
const record = (extra: Record<string, unknown> = {}) => ({ ...base, placementTypes: ["price_sheet", "quote"], customerId: customer, media: claims(), ...extra });

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

  it("사진 8MB·영상 50MB·30초·영상 1개·전체 10개, 저장소가 받는 형식만, 사진 1장 이상이어야 방문 인정", () => {
    expect(validateFieldMedia([{ mimeType: "image/jpeg", size: 8 * MB }, { durationSeconds: 30, mimeType: "video/mp4", size: 50 * MB }])).toMatchObject({ ok: true, photoCount: 1 });
    expect(validateFieldMedia([{ mimeType: "image/jpeg", size: 8 * MB + 1 }]).ok).toBe(false);
    expect(validateFieldMedia([{ durationSeconds: 31, mimeType: "video/mp4", size: 10 }]).ok).toBe(false);
    expect(validateFieldMedia([{ mimeType: "video/mp4", size: 10 }]).ok).toBe(false); // 길이 없음
    expect(validateFieldMedia([{ durationSeconds: 5, mimeType: "video/mp4", size: 50 * MB + 1 }]).ok).toBe(false);
    expect(validateFieldMedia([{ durationSeconds: 5, mimeType: "video/mp4", size: 1 }, { durationSeconds: 5, mimeType: "video/quicktime", size: 1 }]).ok).toBe(false);
    expect(validateFieldMedia(Array.from({ length: 11 }, () => ({ mimeType: "image/png", size: 1 }))).ok).toBe(false);
    for (const type of ["application/pdf", "image/heic", "image/heif", "video/webm"]) expect(validateFieldMedia([{ durationSeconds: 5, mimeType: type, size: 1 }]).ok).toBe(false); // 버킷이 거절하는 형식
    expect(validateFieldMedia([{ mimeType: "image/jpeg", size: Number.NaN }]).ok).toBe(false);
    expect(countsAsVisit(validateFieldMedia([{ durationSeconds: 5, mimeType: "video/mp4", size: 1 }]).photoCount)).toBe(false); // 영상만
    expect(countsAsVisit(1)).toBe(true);
  });
});

describe("CX-135 현장 기록 업로드 구조(파일은 함수 본문을 거치지 않는다)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", company);
    mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { userId: user, companyMemberId: "member-1" } });
    mocks.scoped.mockReturnValue(false);
    mocks.capability.mockReturnValue(false);
    mocks.access.mockResolvedValue(true);
    mocks.sign.mockResolvedValue("https://signed.test/a");
    mocks.storage.mockImplementation(async (path: string) => {
      if (path.startsWith("object/upload/sign/")) return { url: `/object/upload/sign/${path.slice("object/upload/sign/".length)}?token=synthetic` };
      if (path.startsWith("object/list/")) return listOf();
      throw new Error(`unexpected storage call ${path}`);
    });
    mocks.db.mockResolvedValue({ countsAsVisit: true, id: "rec-1", reused: false });
  });

  it("upload-urls: 5MB 사진 2장과 40MB 영상도 파일 정보(JSON 몇백 바이트)만 받아 경로별 서명 주소를 준다", async () => {
    const body = { idempotencyKey: KEY, files: [photo5, photo5, video40] };
    const request = json("/api/field-records/upload-urls", body);
    expect(JSON.stringify(body).length).toBeLessThan(400); // 본문 한도(4.5MB)와 무관: 파일 내용은 들어 있지 않다
    const response = await UPLOAD_URLS(request);
    expect(response.status).toBe(200);
    const { uploads } = await response.json();
    expect(uploads.map((item: { path: string }) => item.path)).toEqual([`${folder()}/0.jpg`, `${folder()}/1.jpg`, `${folder()}/2.mp4`]);
    expect(uploads.map((item: { kind: string }) => item.kind)).toEqual(["photo", "photo", "video"]);
    for (const item of uploads) expect(item.uploadUrl).toBe(`https://sb.test/storage/v1/object/upload/sign/customer-attachments/${item.path}?token=synthetic`);
    // 저장소에는 서명 요청(본문 "{}")만 갔다. 파일 바이트는 서버를 지나가지 않는다.
    expect(mocks.storage).toHaveBeenCalledTimes(3);
    for (const [path, init] of mocks.storage.mock.calls) { expect(String(path)).toMatch(/^object\/upload\/sign\/customer-attachments\//); expect(init).toMatchObject({ body: "{}", method: "POST", headers: expect.objectContaining({ "x-upsert": "true" }) }); }
  });

  it("upload-urls: 검증 실패·잘못된 본문·multipart·플래그 OFF·로그인 없음은 저장소를 건드리지 않는다", async () => {
    const bad = async (files: unknown) => (await UPLOAD_URLS(json("/api/field-records/upload-urls", { idempotencyKey: KEY, files }))).status;
    expect(await bad([{ mimeType: "image/jpeg", size: 9 * MB }])).toBe(400);
    expect(await bad([{ durationSeconds: 31, mimeType: "video/mp4", size: 10 * MB }])).toBe(400);
    expect(await bad([{ mimeType: "video/mp4", size: 10 * MB }])).toBe(400);
    expect(await bad([{ mimeType: "image/heic", size: 1 * MB }])).toBe(400);
    expect(await bad([{ mimeType: "image/jpeg", size: "5" }])).toBe(400);
    expect(await bad(Array.from({ length: 11 }, () => photo5))).toBe(400);
    expect(await bad("nope")).toBe(400);
    expect((await UPLOAD_URLS(json("/api/field-records/upload-urls", { idempotencyKey: "짧음", files: [photo5] }))).status).toBe(400);
    const multipart = new FormData(); multipart.append("media", new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }));
    expect((await UPLOAD_URLS(new NextRequest("https://fixture.test/api/field-records/upload-urls", { method: "POST", body: multipart }))).status).toBe(400);
    expect((await UPLOAD_URLS(json("/api/field-records/upload-urls", { idempotencyKey: KEY, files: [{ ...photo5, pad: "x".repeat(20_000) }] }))).status).toBe(400); // 작은 본문만
    mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: {} });
    expect((await UPLOAD_URLS(json("/api/field-records/upload-urls", { idempotencyKey: KEY, files: [photo5] }))).status).toBe(401);
    mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { userId: user } });
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", "other-company");
    expect((await UPLOAD_URLS(json("/api/field-records/upload-urls", { idempotencyKey: KEY, files: [photo5] }))).status).toBe(404);
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("기록: 올라간 객체를 저장소에서 확인한 뒤 기록 함수를 한 번 부르고, 회사·기록자는 세션에서만 온다", async () => {
    const request = json("/api/field-records", record({ companyId: otherCompany }));
    expect(JSON.stringify(record()).length).toBeLessThan(2000); // 5MB·5MB·40MB를 올렸어도 이 요청 본문은 작다
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ countsAsVisit: true, id: "rec-1", reused: false });
    expect(mocks.storage).toHaveBeenCalledTimes(1);
    expect(mocks.storage.mock.calls[0][0]).toBe("object/list/customer-attachments");
    expect(JSON.parse(mocks.storage.mock.calls[0][1].body)).toEqual({ prefix: folder(), limit: 100 });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(mocks.db.mock.calls[0][0]).toBe("rpc/create_field_record_v1");
    expect(body).toMatchObject({ p_company_id: company, p_actor_user_id: user, p_actor_member_id: "member-1", p_kind: "placement", p_placement_types: ["price_sheet", "quote"],
      p_customer_id: customer, p_assignment_id: null, p_latitude: 37.5665, p_accuracy_m: 12.3, p_actor_name: "합성 알바" });
    expect(body.p_media).toEqual([
      { kind: "photo", mime_type: "image/jpeg", size_bytes: 5 * MB, storage_path: `${folder()}/0.jpg` },
      { kind: "photo", mime_type: "image/jpeg", size_bytes: 5 * MB, storage_path: `${folder()}/1.jpg` },
      { duration_seconds: 28, kind: "video", mime_type: "video/mp4", size_bytes: 40 * MB, storage_path: `${folder()}/2.mp4` }
    ]);
  });

  it("올리지 않은 경로는 거부한다(저장소에 객체가 없거나 크기·종류를 확인할 수 없을 때)", async () => {
    mocks.storage.mockResolvedValueOnce([]);
    expect((await POST(json("/api/field-records", record()))).status).toBe(400);
    mocks.storage.mockResolvedValueOnce(listOf().slice(0, 2)); // 영상은 아직 안 올라감
    expect((await POST(json("/api/field-records", record()))).status).toBe(400);
    mocks.storage.mockResolvedValueOnce(listOf().map((item) => ({ name: item.name }))); // 크기·종류 확인 불가 → 거부
    expect((await POST(json("/api/field-records", record()))).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("다른 회사·다른 폴더·다른 번호의 경로는 저장소를 보기 전에 거부한다", async () => {
    const media = claims();
    const attempt = async (patch: (list: ReturnType<typeof claims>) => unknown) => (await POST(json("/api/field-records", record({ media: patch(claims()) })))).status;
    expect(await attempt((list) => list.map((item) => ({ ...item, path: item.path.replace(company, otherCompany) })))).toBe(400);
    expect(await attempt((list) => list.map((item) => ({ ...item, path: item.path.replace("/field-records/", "/customer-attachments/") })))).toBe(400);
    expect(await attempt((list) => list.map((item) => ({ ...item, path: `${company}/field-records/${hash("another-key-9999")}/0.jpg` })))).toBe(400); // 다른 기록의 파일
    expect(await attempt((list) => list.map((item, index) => ({ ...item, path: list[(index + 1) % list.length].path })))).toBe(400); // 번호 뒤섞기
    expect(await attempt((list) => list.map((item) => ({ ...item, path: item.path.replace("/0.jpg", "/../0.jpg") })))).toBe(400);
    expect(await attempt((list) => list.map((item) => ({ ...item, path: "" })))).toBe(400);
    expect(media).toHaveLength(3);
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
  });

  it("저장소의 실제 크기·종류가 주장과 다르면 거부한다", async () => {
    mocks.storage.mockResolvedValueOnce(listOf().map((item, index) => index === 0 ? { ...item, metadata: { mimetype: "image/jpeg", size: 20 * MB } } : item));
    expect((await POST(json("/api/field-records", record()))).status).toBe(400);
    mocks.storage.mockResolvedValueOnce(listOf().map((item, index) => index === 2 ? { ...item, metadata: { mimetype: "application/pdf", size: 40 * MB } } : item));
    expect((await POST(json("/api/field-records", record()))).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("검증 실패·multipart·큰 본문은 저장소와 DB를 건드리지 않고 400", async () => {
    expect((await POST(json("/api/field-records", record({ latitude: "abc" })))).status).toBe(400);
    expect((await POST(json("/api/field-records", record({ kind: "delivery" })))).status).toBe(400);
    expect((await POST(json("/api/field-records", record({ media: [{ mimeType: "image/jpeg", path: `${folder()}/0.jpg`, size: 9 * MB }] })))).status).toBe(400);
    expect((await POST(json("/api/field-records", record({ media: Array.from({ length: 11 }, () => ({})) })))).status).toBe(400);
    const form = new FormData(); form.set("kind", "visit"); form.append("media", new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }));
    expect((await POST(new NextRequest("https://fixture.test/api/field-records", { method: "POST", body: form }))).status).toBe(400); // 파일을 본문에 싣는 옛 방식은 받지 않는다
    expect((await POST(json("/api/field-records", record({ memo: "x".repeat(40_000) })))).status).toBe(400);
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
  });

  it("사진 없는 기록(비치)은 저장되지만 방문 인정 안 됨으로 돌려주고, 저장소 확인도 생략한다", async () => {
    mocks.db.mockResolvedValue({ countsAsVisit: false, id: "rec-2", reused: false });
    const response = await POST(json("/api/field-records", record({ media: [] })));
    expect(await response.json()).toMatchObject({ countsAsVisit: false });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.db.mock.calls[0][1].body).p_media).toEqual([]);
  });

  it("배정되지 않은 매장은 403, 구성원이 아니면(RPC 거절) 403, 같은 키 재전송은 reused", async () => {
    mocks.scoped.mockReturnValue(true); mocks.access.mockResolvedValue(false);
    expect((await POST(json("/api/field-records", record()))).status).toBe(403);
    expect(mocks.storage).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue(true);
    mocks.db.mockRejectedValueOnce(new Error("field_record_actor_forbidden"));
    expect((await POST(json("/api/field-records", record()))).status).toBe(403);
    mocks.db.mockResolvedValueOnce({ countsAsVisit: true, id: "rec-1", reused: true });
    expect(await (await POST(json("/api/field-records", record()))).json()).toMatchObject({ reused: true });
  });

  it("플래그 OFF·allowlist 밖이면 404, 로그인이 없으면 401", async () => {
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", "other-company");
    expect((await POST(json("/api/field-records", record()))).status).toBe(404);
    expect((await GET(new NextRequest("https://fixture.test/api/field-records"))).status).toBe(404);
    vi.unstubAllEnvs();
    expect((await POST(json("/api/field-records", record()))).status).toBe(404); // 기본 OFF
    vi.stubEnv("FEATURE_FIELD_RECORDS_COMPANY_IDS", company);
    mocks.auth.mockResolvedValue({ ok: false });
    expect((await POST(json("/api/field-records", record()))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("목록: 운영 권한이 없으면 내 기록만, 있으면 회사 전체. 사진은 서명 주소로만", async () => {
    mocks.db.mockResolvedValue([{ id: "rec-1", kind: "visit", placement_types: [], actor_user_id: user, customer_id: customer, lead_id: null, latitude: 37.5, longitude: 127, accuracy_m: 5,
      captured_at: "2026-11-24T05:00:00Z", memo: null, photo_count: 1, counts_as_visit: true,
      field_record_photos: [{ id: "p2", media_kind: "photo", storage_path: `${folder()}/1.jpg`, mime_type: "image/jpeg", sort_order: 1 }, { id: "p1", media_kind: "photo", storage_path: `${folder()}/0.jpg`, mime_type: "image/jpeg", sort_order: 0 }] }]);
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
