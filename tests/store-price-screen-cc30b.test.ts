import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStorePriceInput, priceDifference, storePriceSource } from "../domains/pricing/store-price";

describe("store price rules (CC-30b)", () => {
  it("names the source: base when there is no store price, store when typed, quote when it came from an accepted quote", () => {
    expect(storePriceSource(null)).toBe("기본");
    expect(storePriceSource({ fromQuote: false })).toBe("매장");
    expect(storePriceSource({ fromQuote: true })).toBe("견적");
  });
  it("difference is store price minus base price, empty without a store price", () => {
    expect(priceDifference(1500, 1200)).toBe(-300);
    expect(priceDifference(1500, 1500)).toBe(0);
    expect(priceDifference(1500, null)).toBeNull();
  });
  it("parses the cell: empty ends the price, digits set it (commas/원/spaces ignored), anything else is an error", () => {
    expect(parseStorePriceInput("")).toBeNull();
    expect(parseStorePriceInput("  ")).toBeNull();
    expect(parseStorePriceInput("1,200원")).toBe(1200);
    expect(parseStorePriceInput("0")).toBe(0);
    expect(parseStorePriceInput("-5")).toBeUndefined();
    expect(parseStorePriceInput("12.5")).toBeUndefined();
    expect(parseStorePriceInput("abc")).toBeUndefined();
    expect(parseStorePriceInput("12345678901234")).toBeUndefined();
  });
});

describe("store price screen contract", () => {
  const api = readFileSync("app/api/store-prices/route.ts", "utf8");
  const screen = readFileSync("components/pricing-store-prices.tsx", "utf8");
  it("the read API is owner/manager only, company-fixed, hides duplicates and counts only active store prices", () => {
    expect(api).toContain("canManagePriceSheets(scope.customerSession)");
    expect(api).toContain("status: 403");
    expect(api).toContain("duplicate_of=is.null");
    expect(api).toContain("status=eq.active");
  });
  it("a typed price is saved through the contract-prices API and a quote price is not editable", () => {
    expect(screen).toContain("/contract-prices");
    expect(screen).toContain('r.source === "견적"');
    expect(screen).toContain("parseStorePriceInput");
  });
  it("grade management only adds (no categories sent would wipe edits) and archives through the margin-template API", () => {
    const manager = readFileSync("components/store-grade-manager.tsx", "utf8");
    expect(manager).toContain('action: "save"');
    expect(manager).not.toContain("id: t.id, action: \"save\"");
    expect(manager).toContain('action: "archive"');
    expect(screen).toContain("StoreGradeManager");
  });
  it("the end date is validated on the server and sent from the screen", () => {
    const lib = readFileSync("lib/pricing/store-price-agreement.ts", "utf8");
    expect(lib).toContain("until < today");
    expect(lib).toContain("effective_until: until");
    expect(screen).toContain("끝나는 날");
  });
  it("the grade select changes the store's grade through the margin-template assign API and the list exposes the grades", () => {
    expect(screen).toContain("/api/margin-templates/customers");
    expect(screen).toContain("이 매장 등급");
    expect(api).toContain("grades: templates");
    expect(api).toContain("gradeId:");
  });
});
