import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));

import { listStoreCosts, updateStoreCost } from "../lib/store/store-costs";

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
});
