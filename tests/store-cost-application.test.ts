import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), feature: vi.fn(), history: vi.fn(), list: vi.fn(), update: vi.fn()
}));
vi.mock("server-only", () => ({}));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("../lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("../lib/store/store-costs", () => ({
  listStoreCostHistory: mocks.history,
  listStoreCosts: mocks.list,
  updateStoreCost: mocks.update
}));

import { changeStoreCost, readStoreCosts } from "../application/organization/store-costs";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000003";
const row = { costKrw: 1200, effectiveOn: "2026-11-07", productName: "사과", specification: "1kg", unit: "봉" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.feature.mockReturnValue(true);
});

describe("store cost application boundary", () => {
  it("does not inspect a session or database while the feature is off", async () => {
    mocks.feature.mockReturnValue(false);
    await expect(readStoreCosts({ companyId, storeAccountId })).resolves.toEqual({ ok: false, status: 404 });
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("allows an active staff member to read only their verified company and store", async () => {
    mocks.context.mockResolvedValue({ companyId, memberId: "member-1", role: "staff", storeAccountId });
    mocks.list.mockResolvedValue({ hasMore: false, rows: [{ id: itemId }] });
    await expect(readStoreCosts({ companyId, product: "사과", storeAccountId })).resolves.toEqual({
      hasMore: false, ok: true, rows: [{ id: itemId }]
    });
    expect(mocks.context).toHaveBeenCalledExactlyOnceWith({ companyId, storeAccountId });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({ companyId, from: undefined, offset: undefined,
      product: "사과", storeAccountId, to: undefined });
  });

  it("rejects staff changes before touching the database", async () => {
    mocks.context.mockResolvedValue({ companyId, memberId: "member-1", role: "staff", storeAccountId });
    await expect(changeStoreCost({ companyId, expectedRevision: 1, itemId, row, storeAccountId }))
      .resolves.toEqual({ ok: false, status: 403 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["owner", "manager"])("uses the verified member id for %s changes", async (role) => {
    mocks.context.mockResolvedValue({ companyId, memberId: "verified-member", role, storeAccountId });
    mocks.update.mockResolvedValue({ id: itemId, replayed: false, revision: 2 });
    const forged = { authUserId: "forged-user", memberId: "forged-member", role: "owner" };
    await expect(changeStoreCost({ ...forged, companyId, expectedRevision: 1, itemId, row, storeAccountId }))
      .resolves.toEqual({ ok: true, result: { id: itemId, replayed: false, revision: 2 } });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      actorMemberId: "verified-member", companyId, expectedRevision: 1, itemId, row, storeAccountId
    });
  });

  it("never turns a public-link-only request into member access", async () => {
    mocks.context.mockResolvedValue(null);
    await expect(readStoreCosts({ companyId, storeAccountId, token: "public-order-token" } as never))
      .resolves.toEqual({ ok: false, status: 401 });
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
