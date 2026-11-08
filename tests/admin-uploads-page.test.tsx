import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUploadHistory: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdminSession: vi.fn().mockResolvedValue({ name: "관리자" }) }));
vi.mock("@/lib/store", () => ({ getUploadHistory: mocks.getUploadHistory }));

import AdminUploadsPage from "../app/admin/uploads/page";

beforeEach(() => vi.clearAllMocks());

it("distinguishes a failed upload-history read from an empty history", async () => {
  mocks.getUploadHistory.mockRejectedValueOnce(new Error("synthetic read failure"));
  const failed = renderToStaticMarkup(await AdminUploadsPage());
  expect(failed).toContain("0건이 아니라 조회 실패 상태입니다.");

  mocks.getUploadHistory.mockResolvedValueOnce([]);
  const empty = renderToStaticMarkup(await AdminUploadsPage());
  expect(empty).toContain("아직 업로드 이력이 없습니다.");
});
