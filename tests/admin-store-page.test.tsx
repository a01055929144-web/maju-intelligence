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
});
