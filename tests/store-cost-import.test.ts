import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), feature: vi.fn(), importRows: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("../lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("../lib/store/store-costs", () => ({ importStoreCosts: mocks.importRows }));

import { applyStoreCostImport, previewStoreCostImport } from "../application/organization/store-cost-import";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "10000000-0000-4000-8000-000000000001";
const importId = "40000000-0000-4000-8000-000000000001";
const rows = [{ costKrw: 18_000, effectiveOn: "2026-11-07", productName: " 양파 ",
  sourceRowNumber: 2, specification: "15kg", unit: "망" }];
const input = { companyId, fileName: "costs.xlsx", importId, rows, storeAccountId };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.feature.mockReturnValue(true);
});

describe("store cost import boundary", () => {
  it("keeps preview read-only and returns normalized rows bound to a confirmation hash", async () => {
    mocks.context.mockResolvedValue({ memberId: "member-1", role: "owner" });
    const result = await previewStoreCostImport(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview).toMatchObject({ importId, rows: [{ productName: "양파", sourceRowNumber: 2 }] });
    expect(result.preview.confirmationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.importRows).not.toHaveBeenCalled();
  });

  it("rejects staff before import and never trusts caller identity fields", async () => {
    mocks.context.mockResolvedValue({ memberId: "verified-staff", role: "staff" });
    await expect(previewStoreCostImport({ ...input, memberId: "forged", role: "owner" } as never))
      .resolves.toEqual({ ok: false, status: 403 });
    expect(mocks.context).toHaveBeenCalledExactlyOnceWith({ companyId, storeAccountId });
    expect(mocks.importRows).not.toHaveBeenCalled();
  });

  it("requires the exact preview hash and applies with the verified member", async () => {
    mocks.context.mockResolvedValue({ memberId: "verified-member", role: "manager" });
    const preview = await previewStoreCostImport(input);
    if (!preview.ok) throw new Error("preview failed");
    mocks.importRows.mockResolvedValue({ imported: 1, replayed: 0, total: 1 });
    await expect(applyStoreCostImport({ ...input, confirmationHash: preview.preview.confirmationHash,
      memberId: "forged-member" } as never)).resolves.toEqual({
      ok: true, result: { imported: 1, replayed: 0, total: 1 }
    });
    expect(mocks.importRows).toHaveBeenCalledExactlyOnceWith({ actorMemberId: "verified-member", companyId,
      fileName: "costs.xlsx", importId, rows: [{ ...rows[0], productName: "양파" }], storeAccountId });
  });

  it("rejects changed rows after preview", async () => {
    mocks.context.mockResolvedValue({ memberId: "member-1", role: "owner" });
    const preview = await previewStoreCostImport(input);
    if (!preview.ok) throw new Error("preview failed");
    await expect(applyStoreCostImport({ ...input, confirmationHash: preview.preview.confirmationHash,
      rows: [{ ...rows[0], costKrw: 19_000 }] })).rejects.toThrow("store_cost_preview_changed");
    expect(mocks.importRows).not.toHaveBeenCalled();
  });

  it("does no session or import work while the feature is off", async () => {
    mocks.feature.mockReturnValue(false);
    await expect(previewStoreCostImport(input)).resolves.toEqual({ ok: false, status: 404 });
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.importRows).not.toHaveBeenCalled();
  });
});
