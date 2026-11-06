import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));

import { importStoreCosts, listStoreCostHistory, listStoreCosts, updateStoreCost } from "../lib/store/store-costs";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000003";

beforeEach(() => vi.clearAllMocks());

describe("store cost repository", () => {
  it("always scopes reads to both company and store", async () => {
    mocks.db.mockResolvedValue([]);
    await listStoreCosts({ companyId, storeAccountId });
    const path = mocks.db.mock.calls[0][0] as string;
    expect(path).toContain(`company_id=eq.${companyId}`);
    expect(path).toContain(`store_account_id=eq.${storeAccountId}`);
    expect(path).toContain("order=effective_on.desc,product_name.asc,id.asc&limit=51&offset=0");
  });

  it("returns a bounded page and signals rows beyond the first 50", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      cost_krw: index, effective_on: "2026-11-07", id: String(index), product_name: `상품 ${index}`,
      revision: 1, specification: "", unit: "개"
    }));
    mocks.db.mockResolvedValue(rows);
    await expect(listStoreCosts({ companyId, offset: 50, storeAccountId })).resolves.toMatchObject({
      hasMore: true, rows: { length: 50 }
    });
    expect(mocks.db.mock.calls[0][0]).toContain("limit=51&offset=50");
  });

  it("bounds history with deterministic revision ordering", async () => {
    mocks.db.mockResolvedValue([]);
    await listStoreCostHistory({ companyId, itemId, offset: 100, storeAccountId });
    expect(mocks.db.mock.calls[0][0]).toContain("order=revision.desc,id.desc&limit=51&offset=100");
  });

  it("passes only the server-verified member to the write RPC", async () => {
    mocks.db.mockResolvedValueOnce([{ product_key: "apple:1kg:bag" }])
      .mockResolvedValueOnce({ id: itemId, replayed: false, revision: 2 });
    await updateStoreCost({
      actorMemberId: "verified-member", companyId, expectedRevision: 1, itemId,
      row: { costKrw: 1200, effectiveOn: "2026-11-07", productName: "사과", specification: "1kg", unit: "봉" },
      storeAccountId
    });
    const [, init] = mocks.db.mock.calls[1];
    expect(JSON.parse(init.body)).toMatchObject({
      p_actor_member_id: "verified-member", p_company_id: companyId, p_store_account_id: storeAccountId
    });
  });

  it("passes normalized import rows and a client UUID to one batch RPC", async () => {
    mocks.db.mockResolvedValue({ imported: 1, replayed: 0, total: 1 });
    await importStoreCosts({ actorMemberId: "verified-member", companyId, fileName: "costs.xlsx",
      importId: "40000000-0000-4000-8000-000000000001",
      rows: [{ costKrw: 18000, effectiveOn: "2026-11-07", productName: "양파", sourceRowNumber: 2,
        specification: "15kg", unit: "망" }], storeAccountId });
    const [path, init] = mocks.db.mock.calls[0];
    expect(path).toBe("rpc/import_store_cost_batch");
    expect(JSON.parse(init.body)).toMatchObject({ p_actor_member_id: "verified-member", p_company_id: companyId,
      p_import_id: "40000000-0000-4000-8000-000000000001", p_store_account_id: storeAccountId,
      p_rows: [{ productKey: "양파|15kg|망", sourceRowNumber: 2 }] });
  });
});
