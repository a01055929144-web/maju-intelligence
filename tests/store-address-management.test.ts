import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assign: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ assignCustomerByTerritory: mocks.assign, supabaseRequest: mocks.db }));

import { createStoreAddressSelection, updateStoreAddress, verifyStoreAddressSelection } from "../lib/store/07-store-address-management";

const scope = { companyId: "00000000-0000-4000-8000-000000000001", storeAccountId: "20000000-0000-4000-8000-000000000001" };

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("STORE_OWNER_ONBOARDING_SECRET", "a".repeat(32)); });

describe("store member address boundary", () => {
  it("accepts only the exact short-lived Kakao selection for the same store", () => {
    const proof = createStoreAddressSelection({ ...scope, address: "서울시 중구 합성로 1" })!;
    expect(verifyStoreAddressSelection(proof, scope)).toBe("서울시 중구 합성로 1");
    expect(verifyStoreAddressSelection(proof, { ...scope, storeAccountId: "20000000-0000-4000-8000-000000000002" })).toBeNull();
    expect(verifyStoreAddressSelection(`${proof.slice(0, -1)}x`, scope)).toBeNull();
  });

  it("updates exactly one company customer and connects only an exact territory match", async () => {
    mocks.db.mockResolvedValueOnce([{ customer_id: "30000000-0000-4000-8000-000000000001" }])
      .mockResolvedValueOnce([{ id: "30000000-0000-4000-8000-000000000001" }]);
    mocks.assign.mockResolvedValue({ status: "matched", territoryId: "40000000-0000-4000-8000-000000000001" });
    await updateStoreAddress({ ...scope, baseAddress: "서울시 중구 합성로 1", addressDetail: "101호" });
    expect(JSON.parse(mocks.db.mock.calls[1][1].body)).toMatchObject({ delivery_territory_id: "40000000-0000-4000-8000-000000000001" });
    expect(mocks.db.mock.calls[1][1].headers.Prefer).toBe("return=representation");
  });

  it("clears territory on ambiguous resolution and rejects a zero-row patch", async () => {
    mocks.db.mockResolvedValueOnce([{ customer_id: "30000000-0000-4000-8000-000000000001" }]).mockResolvedValueOnce([]);
    mocks.assign.mockResolvedValue({ status: "ambiguous" });
    await expect(updateStoreAddress({ ...scope, baseAddress: "서울시 중구 합성로 1", addressDetail: "101호" }))
      .rejects.toThrow("store_address_not_updated");
    expect(JSON.parse(mocks.db.mock.calls[1][1].body).delivery_territory_id).toBeNull();
  });
});
