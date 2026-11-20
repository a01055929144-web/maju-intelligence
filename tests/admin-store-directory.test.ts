import { afterEach, describe, expect, it, vi } from "vitest";
import { findAdminStoreDuplicateIds } from "../domains/store/admin-store-directory";
import { hasFeatureRollout, isFeatureEnabled } from "../lib/feature-flags";

afterEach(() => vi.unstubAllEnvs());

describe("findAdminStoreDuplicateIds", () => {
  it("marks the same business number even when punctuation differs", () => {
    const result = findAdminStoreDuplicateIds([
      { id: "a", storeName: "첫 매장", businessNumber: "123-45-67890", address: "서울 강남구 1" },
      { id: "b", storeName: "둘째 매장", businessNumber: "1234567890", address: "서울 강남구 2" },
    ]);
    expect([...result]).toEqual(["a", "b"]);
  });

  it("marks the same normalized name and address without treating missing values as duplicates", () => {
    const result = findAdminStoreDuplicateIds([
      { id: "a", storeName: "합성 식당", businessNumber: null, address: "서울시 중구 1-2" },
      { id: "b", storeName: "합성식당", businessNumber: null, address: "서울시 중구 1 2" },
      { id: "c", storeName: "주소 없음", businessNumber: null, address: null },
      { id: "d", storeName: "주소 없음", businessNumber: null, address: null },
    ]);
    expect([...result]).toEqual(["a", "b"]);
  });

  it("keeps the admin screen off until at least one company is allowlisted", () => {
    expect(hasFeatureRollout("ADMIN_STORE_MANAGEMENT")).toBe(false);
    expect(isFeatureEnabled("ADMIN_STORE_MANAGEMENT", "company-a")).toBe(false);
    vi.stubEnv("FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS", "company-a");
    expect(hasFeatureRollout("ADMIN_STORE_MANAGEMENT")).toBe(true);
    expect(isFeatureEnabled("ADMIN_STORE_MANAGEMENT", "company-a")).toBe(true);
    expect(isFeatureEnabled("ADMIN_STORE_MANAGEMENT", "company-b")).toBe(false);
  });
});
