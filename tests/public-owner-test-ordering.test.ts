import { afterEach, expect, it, vi } from "vitest";
import { setupPublicOwnerTestEnv } from "./fixtures/public-owner-test-env";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { preparePublicOwnerTestOrdering } from "../lib/pricing/public-owner-test-ordering";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("prepares only the verified test store's weekdays without overwriting price, cutoff or existing rules", async () => {
  const { company } = setupPublicOwnerTestEnv();
  mocks.db.mockResolvedValueOnce([{ customer_id: "synthetic-customer" }]).mockResolvedValueOnce(undefined);
  await preparePublicOwnerTestOrdering(company, "synthetic-store");
  expect(mocks.db.mock.calls[0][0]).toContain(`company_id=eq.${company}&id=eq.synthetic-store`);
  expect(mocks.db.mock.calls[0][0]).toContain("verification_request_id=like.test-only:*");
  expect(mocks.db.mock.calls[1][1].headers.Prefer).toContain("ignore-duplicates");
  expect(JSON.parse(mocks.db.mock.calls[1][1].body)).toEqual({ company_id: company,
    customer_id: "synthetic-customer", delivery_weekdays: [0, 1, 2, 3, 4, 5, 6] });
});

it("refuses an ordinary store or wrong company before writing any rule", async () => {
  const { company } = setupPublicOwnerTestEnv();
  mocks.db.mockResolvedValueOnce([]);
  await expect(preparePublicOwnerTestOrdering(company, "ordinary-store")).rejects.toThrow("unavailable");
  expect(mocks.db).toHaveBeenCalledOnce();
  mocks.db.mockClear();
  await expect(preparePublicOwnerTestOrdering("other-company", "store")).rejects.toThrow("unavailable");
  expect(mocks.db).not.toHaveBeenCalled();
});
