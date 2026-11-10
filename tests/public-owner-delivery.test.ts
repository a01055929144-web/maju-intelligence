import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ assign: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ assignCustomerByTerritory: mocks.assign, supabaseRequest: mocks.db }));
import { resolvePublicOwnerDelivery } from "../lib/pricing/public-owner-delivery";
const company = "00000000-0000-4000-8000-000000000001";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("stays OFF and performs no assignment or rule query for an unapproved company", async () => {
  expect(await resolvePublicOwnerDelivery(company, "synthetic address")).toBeUndefined();
  vi.stubEnv("STORE_PUBLIC_OWNER_DELIVERY_ENABLED", "true");
  vi.stubEnv("FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS", "another-company");
  expect(await resolvePublicOwnerDelivery(company, "synthetic address")).toBeUndefined();
  expect(mocks.assign).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
});

it("reuses the existing server address recommendation and scopes the native weekday rule to the same company", async () => {
  vi.stubEnv("STORE_PUBLIC_OWNER_DELIVERY_ENABLED", "true"); vi.stubEnv("FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS", company);
  mocks.assign.mockResolvedValue({ status: "matched", territoryId: "synthetic-territory" });
  mocks.db.mockResolvedValue([{ delivery_weekdays: [1, 3, 5] }]);
  expect(await resolvePublicOwnerDelivery(company, "synthetic address")).toBe("synthetic-territory");
  expect(mocks.assign).toHaveBeenCalledWith(company, "synthetic address");
  expect(mocks.db.mock.calls[0][0]).toContain(`company_id=eq.${company}&territory_id=eq.synthetic-territory`);
});

it("leaves delivery pending for an unmatched address or missing weekdays without creating any data", async () => {
  vi.stubEnv("STORE_PUBLIC_OWNER_DELIVERY_ENABLED", "true"); vi.stubEnv("FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS", company);
  mocks.assign.mockResolvedValueOnce({ status: "unassigned" });
  await expect(resolvePublicOwnerDelivery(company, "unmatched address")).resolves.toBeUndefined();
  expect(mocks.db).not.toHaveBeenCalled();
  mocks.assign.mockResolvedValue({ status: "matched", territoryId: "synthetic-territory" });
  for (const rows of [[], [{ delivery_weekdays: null }], [{ delivery_weekdays: [] }], [{ delivery_weekdays: [9] }]]) {
    mocks.db.mockResolvedValueOnce(rows);
    await expect(resolvePublicOwnerDelivery(company, "synthetic address")).resolves.toBeUndefined();
  }
});

it("does not hide a delivery lookup outage as an unconfigured area", async () => {
  vi.stubEnv("STORE_PUBLIC_OWNER_DELIVERY_ENABLED", "true"); vi.stubEnv("FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS", company);
  mocks.assign.mockRejectedValueOnce(new Error("lookup unavailable"));
  await expect(resolvePublicOwnerDelivery(company, "synthetic address")).rejects.toThrow("lookup unavailable");
});
