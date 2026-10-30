import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/pricing/documents-repository", () => ({
  pricingDocumentsRepository: { request: mocks.request },
}));
import { GET, POST } from "../app/api/pricing-documents/route";
const c = "00000000-0000-4000-8000-000000000001",
  flag = process.env.PRICE_SHEETS_ENABLED,
  hold = process.env.HOLD_MODULES_ENABLED_COMPANY_IDS;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRICE_SHEETS_ENABLED = "true";
  process.env.HOLD_MODULES_ENABLED_COMPANY_IDS = c;
  mocks.auth.mockResolvedValue({
    ok: true,
    companyId: c,
    customerSession: {
      role: "owner",
      workspaceRole: "owner",
      email: "synthetic@example.test",
    },
  });
  mocks.request.mockResolvedValue({ items: [], total: 0 });
});
afterEach(() => {
  if (flag === undefined) delete process.env.PRICE_SHEETS_ENABLED;
  else process.env.PRICE_SHEETS_ENABLED = flag;
  if (hold === undefined) delete process.env.HOLD_MODULES_ENABLED_COMPANY_IDS;
  else process.env.HOLD_MODULES_ENABLED_COMPANY_IDS = hold;
});
it("OFF performs no auth or SQL call", async () => {
  process.env.PRICE_SHEETS_ENABLED = "false";
  expect(
    (await GET(new NextRequest("http://localhost/api/pricing-documents")))
      .status,
  ).toBe(404);
  expect(
    (
      await POST(
        new NextRequest("http://localhost/api/pricing-documents", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(404);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});
it("allows manager and sales with a server-derived opaque author", async () => {
  for (const workspaceRole of ["manager", "sales"]) {
    mocks.auth.mockResolvedValueOnce({
      ok: true,
      companyId: c,
      customerSession: {
        role: "member",
        workspaceRole,
        email: "synthetic@example.test",
      },
    });
    expect(
      (
        await GET(
          new NextRequest(
            "http://localhost/api/pricing-documents?action=list&companyId=other",
          ),
        )
      ).status,
    ).toBe(200);
  }
  expect(mocks.request).toHaveBeenLastCalledWith(
    {
      companyId: c,
      manager: false,
      actor: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
    "list",
    expect.objectContaining({ page: 1 }),
  );
});
it.each(["driver", "member", "temporary"])(
  "denies %s",
  async (workspaceRole) => {
    mocks.auth.mockResolvedValueOnce({
      ok: true,
      companyId: c,
      customerSession: {
        role: "member",
        workspaceRole,
        email: "synthetic@example.test",
      },
    });
    expect(
      (await GET(new NextRequest("http://localhost/api/pricing-documents")))
        .status,
    ).toBe(403);
    expect(mocks.request).not.toHaveBeenCalled();
  },
);
it("denies anonymous, unscoped and held companies before SQL", async () => {
  mocks.auth.mockResolvedValueOnce({ ok: false });
  expect(
    (await GET(new NextRequest("http://localhost/api/pricing-documents")))
      .status,
  ).toBe(401);
  process.env.HOLD_MODULES_ENABLED_COMPANY_IDS = "";
  expect(
    (await GET(new NextRequest("http://localhost/api/pricing-documents")))
      .status,
  ).toBe(404);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("accepts actual incoming Host when Next normalizes the internal URL and rejects cross-site writes", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const valid = new NextRequest("http://localhost:3179/api/pricing-documents", {
    method: "POST",
    headers: { host: "127.0.0.1:3179", origin: "http://127.0.0.1:3179" },
    body: JSON.stringify({ action: "publish", id, expected: 1 }),
  });
  expect((await POST(valid)).status).toBe(200);
  mocks.request.mockClear();
  expect(
    (
      await POST(
        new NextRequest("http://localhost/api/pricing-documents", {
          method: "POST",
          headers: { host: "localhost", origin: "https://other.example.test" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});
