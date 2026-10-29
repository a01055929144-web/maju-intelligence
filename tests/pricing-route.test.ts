import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), execute: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/pricing/price-sheet-repository", () => ({ priceSheetRepository: { read: mocks.read, execute: mocks.execute } }));
import { GET, POST } from "../app/api/price-sheets/route";
const company = "00000000-0000-4000-8000-000000000001";
const originalFlag = process.env.PRICE_SHEETS_ENABLED;
const originalHold = process.env.HOLD_MODULES_ENABLED_COMPANY_IDS;
beforeEach(() => {
  vi.clearAllMocks(); process.env.PRICE_SHEETS_ENABLED = "true"; process.env.HOLD_MODULES_ENABLED_COMPANY_IDS = company;
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { role: "owner" } });
  mocks.read.mockResolvedValue({ groups: [], items: [], lastBatch: null, restored: false });
});
afterEach(() => {
  if (originalFlag === undefined) delete process.env.PRICE_SHEETS_ENABLED; else process.env.PRICE_SHEETS_ENABLED = originalFlag;
  if (originalHold === undefined) delete process.env.HOLD_MODULES_ENABLED_COMPANY_IDS; else process.env.HOLD_MODULES_ENABLED_COMPANY_IDS = originalHold;
});
describe("pricing boundary", () => {
  it("OFF bypasses auth and repository entirely even for writes", async () => {
    process.env.PRICE_SHEETS_ENABLED = "false";
    expect((await GET(new NextRequest("http://localhost/api/price-sheets"))).status).toBe(404);
    expect((await POST(new NextRequest("http://localhost/api/price-sheets", { method: "POST", body: '{}' }))).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rejects anonymous and ordinary staff requests", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false });
    expect((await GET(new NextRequest("http://localhost/api/price-sheets"))).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ ok: true, companyId: company, customerSession: { role: "member" } });
    expect((await GET(new NextRequest("http://localhost/api/price-sheets"))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not expose a held company", async () => {
    process.env.HOLD_MODULES_ENABLED_COMPANY_IDS = "";
    expect((await GET(new NextRequest("http://localhost/api/price-sheets"))).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("uses authenticated company rather than body company", async () => {
    const response = await POST(new NextRequest("http://localhost/api/price-sheets", { method: "POST", body: JSON.stringify({ action: "recalculate", companyId: "other" }) }));
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(company, expect.objectContaining({ action: "recalculate" }));
    expect(mocks.read).toHaveBeenCalledWith(company, { search: "", page: 1 });
  });
});

it("passes bounded search/pagination and refuses invalid pages before repository reads", async () => {
  expect((await GET(new NextRequest("http://localhost/api/price-sheets?q=vegetable&page=2"))).status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(company, { search: "vegetable", page: 2 });
  mocks.read.mockClear();
  expect((await GET(new NextRequest("http://localhost/api/price-sheets?page=0"))).status).toBe(400);
  expect((await GET(new NextRequest("http://localhost/api/price-sheets?page=1.2"))).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});

it("allows a manager to read and recalculate within the authenticated company", async () => {
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { role: "member", workspaceRole: "manager" } });
  expect((await GET(new NextRequest("http://localhost/api/price-sheets"))).status).toBe(200);
  expect((await POST(new NextRequest("http://localhost/api/price-sheets", { method: "POST", body: JSON.stringify({ action: "recalculate" }) }))).status).toBe(200);
  expect(mocks.execute).toHaveBeenCalledWith(company, { action: "recalculate" });
});
