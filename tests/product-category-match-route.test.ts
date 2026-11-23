import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(), list: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/product-category-match", () => ({ listCategoryMatches: mocks.list, saveCategoryMatch: mocks.save }));

import { GET, POST } from "../app/api/product-categories/matches/route";

const companyA = "10000000-0000-4000-8000-000000000001";
const companyB = "20000000-0000-4000-8000-000000000002";
const categoryId = "30000000-0000-4000-8000-000000000003";
const commonId = "40000000-0000-4000-8000-000000000004";
const get = () => GET(new NextRequest("http://localhost/api/product-categories/matches"));
const post = () => POST(new NextRequest("http://localhost/api/product-categories/matches", { method: "POST", body: JSON.stringify({ categoryId, majuCategoryId: commonId }) }));

describe("CX-95 category match route allowlist", () => {
  beforeEach(() => {
    vi.stubEnv("FEATURE_COMMON_CATEGORY_MAPPING", "true");
    vi.stubEnv("FEATURE_COMMON_CATEGORY_MAPPING_COMPANY_IDS", companyA);
    mocks.capability.mockReturnValue(true);
    mocks.list.mockResolvedValue({ categories: [], options: [] });
    mocks.save.mockResolvedValue({ id: categoryId, majuCategoryId: commonId });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("returns 404 for GET and POST when a globally enabled company is not allowlisted", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId: companyB, customerSession: { workspaceRole: "owner" } });
    expect((await get()).status).toBe(404);
    expect((await post()).status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("allows both methods only for the exact allowlisted company", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId: companyA, customerSession: { workspaceRole: "owner" } });
    expect((await get()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(companyA);
    expect(mocks.save).toHaveBeenCalledWith(companyA, categoryId, commonId);
  });
});
