import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeOwnerMobile, ownerMobileLast4 } from "../domains/store/owner-phone";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ db: vi.fn(), feature: vi.fn(), allowed: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("../lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: mocks.allowed }));
import { confirmPhoneLink, declinePhoneLink, listPhoneLinkCandidates, phoneHasCustomerMatch, phoneLinkCompanyIds } from "../lib/store/07-store-phone-link";

const c1 = "00000000-0000-4000-8000-000000000001", c2 = "00000000-0000-4000-8000-000000000002";
const user = "10000000-0000-4000-8000-000000000001", k1 = "20000000-0000-4000-8000-000000000001";

describe("CX-146 normalizeOwnerMobile", () => {
  it("같은 번호의 여러 표기를 010xxxxxxxx로 맞춘다", () => {
    for (const raw of ["010-1111-2222", "01011112222", "+82 10-1111-2222", " 010 1111 2222 "]) expect(normalizeOwnerMobile(raw)).toBe("01011112222");
  });
  it("010 휴대폰이 아니면 null(유선·짧은 값·비문자)", () => {
    for (const raw of ["02-123-4567", "010-111-222", "01211112222", "", null, 1011112222]) expect(normalizeOwnerMobile(raw)).toBeNull();
    expect(ownerMobileLast4("01011112222")).toBe("2222");
  });
});

describe("CX-146 phone link server calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FEATURE_STORE_PHONE_LINK_COMPANY_IDS", `${c1}, ${c2}`);
    mocks.feature.mockImplementation((feature: string, company?: string) => feature === "STORE_PHONE_LINK" && company === c1);
    mocks.allowed.mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("플래그·세션 허용 회사만 대상(전역 true나 목록 밖 회사는 제외)", () => {
    expect(phoneLinkCompanyIds()).toEqual([c1]);
    vi.stubEnv("FEATURE_STORE_PHONE_LINK_COMPANY_IDS", "");
    expect(phoneLinkCompanyIds()).toEqual([]);
  });

  it("플래그가 꺼져 있으면 DB를 부르지 않는다", async () => {
    vi.stubEnv("FEATURE_STORE_PHONE_LINK_COMPANY_IDS", "");
    expect(await phoneHasCustomerMatch("01011112222")).toBe(false);
    expect(await listPhoneLinkCandidates(user)).toEqual([]);
    expect(await confirmPhoneLink(user, [k1])).toEqual({ linked: [], conflicts: 0, skipped: 0 });
    expect(await declinePhoneLink(user, [k1])).toBe(0);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("번호는 서버가 app_users에서 읽어 RPC에 넘기고, 후보 응답에는 번호가 없다", async () => {
    mocks.db.mockImplementation(async (path: string) => {
      if (path.startsWith("app_users?")) return [{ phone: "+82 10-1111-2222" }];
      if (path === "rpc/phone_link_candidates_v1") return [{ company_id: c1, customer_id: k1, customer_name: "홍곱창 신촌점", address_hint: "서울 서대문구", state: "linkable" }];
      return [];
    });
    const result = await listPhoneLinkCandidates(user);
    expect(result).toEqual([{ companyId: c1, customerId: k1, customerName: "홍곱창 신촌점", addressHint: "서울 서대문구", state: "linkable" }]);
    expect(JSON.stringify(result)).not.toContain("1111");
    const rpc = mocks.db.mock.calls.find(call => call[0] === "rpc/phone_link_candidates_v1")!;
    expect(JSON.parse(rpc[1].body)).toEqual({ p_auth_user: user, p_phone: "01011112222", p_companies: [c1] });
  });

  it("저장된 번호가 010이 아니면 연결 RPC를 부르지 않는다", async () => {
    mocks.db.mockResolvedValue([{ phone: "02-123-4567" }]);
    expect(await confirmPhoneLink(user, [k1])).toEqual({ linked: [], conflicts: 0, skipped: 0 });
    expect(mocks.db.mock.calls.every(call => !String(call[0]).startsWith("rpc/"))).toBe(true);
  });

  it("확인 연결은 선택한 거래처와 허용 회사만 RPC로 보낸다", async () => {
    mocks.db.mockImplementation(async (path: string) => path.startsWith("app_users?") ? [{ phone: "01011112222" }] : { linked: [{ companyId: c1, storeAccountId: "s" }], conflicts: 1, skipped: 0 });
    expect((await confirmPhoneLink(user, [k1])).linked).toHaveLength(1);
    const rpc = mocks.db.mock.calls.find(call => call[0] === "rpc/confirm_phone_link_v1")!;
    expect(JSON.parse(rpc[1].body)).toEqual({ p_auth_user: user, p_phone: "01011112222", p_customer_ids: [k1], p_companies: [c1] });
  });
});
