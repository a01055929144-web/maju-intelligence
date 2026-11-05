import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn(), manager: true }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/lib/pricing/store-order-feature", () => ({ storeOrderingEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: () => mocks.manager }));
vi.mock("@/domains/order/order-rules", () => import("../domains/order/order-rules"));
import { GET, POST } from "../app/api/pricing-order-settings/route";

const company = "00000000-0000-4000-8000-000000000001";
function request(enabled: unknown = true, origin = "https://test") {
  return new NextRequest("https://test/api/pricing-order-settings", { method: "POST", headers: { origin }, body: JSON.stringify({ action: "cost-direction", enabled, companyId: "forged", cost: 9999 }) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.manager = true; mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { role: "owner" } }); mocks.db.mockResolvedValue(true); vi.stubEnv("STORE_PURCHASE_COST_DIRECTION_ENABLED", "true"); });
afterEach(() => vi.unstubAllEnvs());

it("keeps feature OFF before its schema/RPC is read or written", async () => {
  vi.stubEnv("STORE_PURCHASE_COST_DIRECTION_ENABLED", "");
  expect((await POST(request())).status).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("saves only the verified company and explicit boolean", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/set_storefront_cost_direction_visibility");
  expect(JSON.parse(mocks.db.mock.calls[0][1].body)).toEqual({ p_company: company, p_enabled: true });
  mocks.db.mockClear();
  expect((await POST(request("true"))).status).toBe(400);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("requires staff authorization and the same origin", async () => {
  expect((await POST(request(true, "https://foreign.test"))).status).toBe(403);
  mocks.manager = false;
  expect((await POST(request())).status).toBe(403);
  mocks.auth.mockResolvedValue({ ok: false });
  expect((await POST(request())).status).toBe(401);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("reports availability without loading any purchase history", async () => {
  mocks.db.mockResolvedValue([]);
  const response = await GET(new NextRequest("https://test/api/pricing-order-settings"));
  expect((await response.json()).costDirectionAvailable).toBe(true);
  expect(mocks.db.mock.calls.every(([path]) => !/purchase_receipt|cost_source/.test(String(path)))).toBe(true);
});
it("does not echo a database error or private values to the settings UI", async () => {
  mocks.db.mockRejectedValue(new Error("Supabase request failed: private vendor cost 9999"));
  const response = await POST(request());
  expect(response.ok).toBe(false);
  expect(JSON.stringify(await response.json())).not.toContain("private vendor cost");
});
