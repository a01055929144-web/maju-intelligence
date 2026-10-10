import { describe, expect, it, vi } from "vitest";
import { bulkUpdateCustomerGrade, type CustomerGradeRepository } from "../lib/customer/application/bulk-update-customer-grade";
import { getCustomerRevenueGrade, isCustomerGrade, requireCustomerGrade, requireCustomerGradeOverride } from "../lib/customer/domain/customer-grade";

describe("customer grade domain", () => {
  it("accepts only the supported customer grades", () => {
    expect(isCustomerGrade("A")).toBe(true);
    expect(isCustomerGrade("B")).toBe(true);
    expect(isCustomerGrade("C")).toBe(true);
    expect(isCustomerGrade("D")).toBe(false);
    expect(() => requireCustomerGrade("전체")).toThrow("등급은 A, B, C 중에서 선택하세요.");
  });

  it("supports clearing a manual override back to revenue-based grading", () => {
    expect(requireCustomerGradeOverride("AUTO")).toBeNull();
    expect(getCustomerRevenueGrade(349)).toBe("B");
    expect(getCustomerRevenueGrade(350)).toBe("A");
    expect(getCustomerRevenueGrade(180)).toBe("B");
    expect(getCustomerRevenueGrade(179)).toBe("C");
  });
});

describe("bulkUpdateCustomerGrade", () => {
  it("normalizes duplicate ids before calling the company-scoped repository", async () => {
    const bulkUpdateGrade = vi.fn().mockResolvedValue({ requested: 2, updated: 2, updatedIds: ["customer-1", "customer-2"] });
    const repository: CustomerGradeRepository = { bulkUpdateGrade };

    await expect(
      bulkUpdateCustomerGrade(repository, {
        companyId: " company-1 ",
        customerIds: ["customer-1", " customer-1 ", "customer-2", ""],
        grade: "B"
      })
    ).resolves.toEqual({ requested: 2, updated: 2, updatedIds: ["customer-1", "customer-2"] });

    expect(bulkUpdateGrade).toHaveBeenCalledWith("company-1", ["customer-1", "customer-2"], "B");
  });

  it("rejects an empty selection before reaching infrastructure", async () => {
    const bulkUpdateGrade = vi.fn();
    const repository: CustomerGradeRepository = { bulkUpdateGrade };

    await expect(bulkUpdateCustomerGrade(repository, { companyId: "company-1", customerIds: [], grade: "A" })).rejects.toThrow(
      "선택된 거래처가 없습니다."
    );
    expect(bulkUpdateGrade).not.toHaveBeenCalled();
  });

  it("passes a cleared override to the company-scoped repository", async () => {
    const bulkUpdateGrade = vi.fn().mockResolvedValue({ requested: 1, updated: 1, updatedIds: ["customer-1"] });
    const repository: CustomerGradeRepository = { bulkUpdateGrade };

    await bulkUpdateCustomerGrade(repository, { companyId: "company-1", customerIds: ["customer-1"], grade: "AUTO" });

    expect(bulkUpdateGrade).toHaveBeenCalledWith("company-1", ["customer-1"], null);
  });

  it("only returns unique ids that belonged to the company-scoped request", async () => {
    const bulkUpdateGrade = vi.fn().mockResolvedValue({
      requested: 99,
      updated: 4,
      updatedIds: ["customer-1", "customer-1", "customer-other", "customer-2"]
    });
    const repository: CustomerGradeRepository = { bulkUpdateGrade };

    await expect(
      bulkUpdateCustomerGrade(repository, {
        companyId: "company-1",
        customerIds: ["customer-1", "customer-2"],
        grade: "C"
      })
    ).resolves.toEqual({ requested: 2, updated: 2, updatedIds: ["customer-1", "customer-2"] });
  });
});
