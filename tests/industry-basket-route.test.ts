import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));

import { GET, PUT } from "../app/api/customer/industry-baskets/route";

const company = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";
const oldEnabled = process.env.INDUSTRY_BASKETS;
const oldCompanies = process.env.INDUSTRY_BASKETS_COMPANY_IDS;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INDUSTRY_BASKETS = "true";
  process.env.INDUSTRY_BASKETS_COMPANY_IDS = company;
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { companyMemberId: member } });
  mocks.capability.mockReturnValue(true);
});
afterEach(() => {
  if (oldEnabled === undefined) delete process.env.INDUSTRY_BASKETS; else process.env.INDUSTRY_BASKETS = oldEnabled;
  if (oldCompanies === undefined) delete process.env.INDUSTRY_BASKETS_COMPANY_IDS; else process.env.INDUSTRY_BASKETS_COMPANY_IDS = oldCompanies;
});

it("기능이 꺼지면 DB를 읽지 않는다", async () => {
  process.env.INDUSTRY_BASKETS = "false";
  expect((await GET(new NextRequest("http://localhost/api/customer/industry-baskets"))).status).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
});

it("관리 권한이 없으면 안내하고 DB를 읽지 않는다", async () => {
  mocks.capability.mockReturnValue(false);
  const response = await GET(new NextRequest("http://localhost/api/customer/industry-baskets"));
  expect(response.status).toBe(403);
  expect((await response.json()).message).toContain("권한");
  expect(mocks.db).not.toHaveBeenCalled();
});

it("빈 업종 바구니도 저장하고 기존 행만 제거한다", async () => {
  mocks.db.mockResolvedValueOnce([{ product_catalog_id: company }]).mockResolvedValueOnce([]);
  const response = await PUT(new NextRequest("http://localhost/api/customer/industry-baskets", {
    method: "PUT", body: JSON.stringify({ industry: "한식", rows: [] }),
  }));
  expect(response.status).toBe(200);
  expect(mocks.db.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
});
