import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  directory: vi.fn(),
  feature: vi.fn(),
  session: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("../lib/auth", () => ({ getAdminSession: mocks.session }));
vi.mock("../lib/admin-store-directory", () => ({ getAdminStoreDirectory: mocks.directory }));
vi.mock("../lib/feature-flags", () => ({ hasFeatureRollout: mocks.feature }));

import AdminStoresPage from "../app/admin/stores/page";

describe("admin store page states", () => {
  beforeEach(() => {
    mocks.session.mockReset().mockResolvedValue({ name: "합성 관리자" });
    mocks.feature.mockReset().mockReturnValue(true);
    mocks.directory.mockReset().mockResolvedValue([]);
  });

  it("redirects signed-out users to the admin login", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(AdminStoresPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/admin/login");
    expect(mocks.directory).not.toHaveBeenCalled();
  });

  it("redirects to the admin home while the feature is off", async () => {
    mocks.feature.mockReturnValue(false);
    await expect(AdminStoresPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/admin");
    expect(mocks.directory).not.toHaveBeenCalled();
  });

  it("shows a read failure separately from an empty directory", async () => {
    mocks.directory.mockRejectedValue(new Error("synthetic read failure"));
    const html = renderToStaticMarkup(await AdminStoresPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("매장 목록 조회에 실패했습니다. 0건과 구분해 표시합니다.");
    expect(html).not.toContain("조건에 맞는 매장이 없습니다.");
  });

  it("shows the store table first and opens management only after selection", async () => {
    mocks.directory.mockResolvedValue([store]);
    const list = renderToStaticMarkup(await AdminStoresPage({ searchParams: Promise.resolve({}) }));
    expect(list).toContain("회사");
    expect(list).toContain("가입일");
    expect(list).toContain("최근 주문");
    expect(list).not.toContain("매장 연결 관리");

    const detail = renderToStaticMarkup(await AdminStoresPage({ searchParams: Promise.resolve({ storeId: store.id }) }));
    expect(detail).toContain("연결 유통사 1");
    expect(detail).toContain("매장 목록으로");
  });

  it("lists owners and members with kakao and last-login status", async () => {
    mocks.directory.mockResolvedValue([store]);
    const html = renderToStaticMarkup(await AdminStoresPage({ searchParams: Promise.resolve({ view: "members" }) }));
    expect(html).toContain("점주·구성원 관리");
    expect(html).toContain("카카오");
    expect(html).toContain("최근 로그인");
    expect(html).toContain("연결 해제·강제 연결");
  });
});

const store = {
  id: "10000000-0000-4000-8000-000000000001", storeName: "합성 매장", businessNumber: "1234567890",
  businessStatus: "active", address: "서울", status: "active", origin: "direct", duplicateSuspected: false,
  createdAt: "2026-11-01T00:00:00Z", recentOrderAt: "2026-11-26T00:00:00Z",
  connections: [{ id: "20000000-0000-4000-8000-000000000001", companyId: "30000000-0000-4000-8000-000000000001", companyName: "합성 유통", customerName: "합성 매출처", status: "active", reviewStatus: null }],
  members: [{ id: "40000000-0000-4000-8000-000000000001", name: "합성 점주", phone: null, email: null, kakaoLinked: true, role: "owner", status: "active", lastLoginAt: "2026-11-26T00:00:00Z" }],
  changes: [],
};
