import { describe, expect, it, vi } from "vitest";
import { findDuplicateCompanyByBusinessNumber } from "../lib/store/08-company-identity";

describe("admin company identity", () => {
  it("returns a duplicate company when the lookup succeeds", async () => {
    const request = vi.fn().mockResolvedValue([{ id: "other-company" }]);
    await expect(findDuplicateCompanyByBusinessNumber(request, "1234567890", "current-company"))
      .resolves.toEqual({ id: "other-company" });
  });

  it("blocks saving when the duplicate lookup fails", async () => {
    const request = vi.fn().mockRejectedValue(new Error("database unavailable"));
    await expect(findDuplicateCompanyByBusinessNumber(request, "1234567890", "current-company"))
      .rejects.toThrow("저장을 중단했습니다");
  });

  it("returns null when the number is available", async () => {
    await expect(findDuplicateCompanyByBusinessNumber(async () => [], "1234567890", "current-company"))
      .resolves.toBeNull();
  });
});
