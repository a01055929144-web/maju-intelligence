import { afterEach, expect, it } from "vitest";
import { documentSharePreview, validateIndustryBasket } from "../domains/pricing/industry-basket";
import { industryBasketsEnabled } from "../lib/pricing/industry-basket-feature";

const company = "00000000-0000-4000-8000-000000000001";
const oldEnabled = process.env.INDUSTRY_BASKETS;
const oldCompanies = process.env.INDUSTRY_BASKETS_COMPANY_IDS;

afterEach(() => {
  if (oldEnabled === undefined) delete process.env.INDUSTRY_BASKETS; else process.env.INDUSTRY_BASKETS = oldEnabled;
  if (oldCompanies === undefined) delete process.env.INDUSTRY_BASKETS_COMPANY_IDS; else process.env.INDUSTRY_BASKETS_COMPANY_IDS = oldCompanies;
});

it("전역 스위치와 회사 allowlist가 모두 맞아야 열린다", () => {
  process.env.INDUSTRY_BASKETS_COMPANY_IDS = company;
  delete process.env.INDUSTRY_BASKETS;
  expect(industryBasketsEnabled(company)).toBe(false);
  process.env.INDUSTRY_BASKETS = "true";
  expect(industryBasketsEnabled(company)).toBe(true);
  expect(industryBasketsEnabled("00000000-0000-4000-8000-000000000002")).toBe(false);
});

it("빈 바구니는 허용하고 순서·소수 셋째 자리 수량을 정규화한다", () => {
  expect(validateIndustryBasket("한식", [])).toEqual([]);
  expect(validateIndustryBasket("중식", [{ productCatalogId: company, defaultQty: 1.2345, isCore: true, sortOrder: 99 }])).toEqual([
    { productCatalogId: company, defaultQty: 1.235, isCore: true, sortOrder: 0 },
  ]);
});

it("잘못된 업종·수량·중복 품목을 거부한다", () => {
  expect(() => validateIndustryBasket("농산", [])).toThrow("업종");
  expect(() => validateIndustryBasket("한식", [{ productCatalogId: company, defaultQty: 0, isCore: false, sortOrder: 0 }])).toThrow("수량");
  expect(() => validateIndustryBasket("한식", [
    { productCatalogId: company, defaultQty: 1, isCore: false, sortOrder: 0 },
    { productCatalogId: company, defaultQty: 2, isCore: true, sortOrder: 1 },
  ])).toThrow("두 번");
});

it("공유 미리보기에는 회사·문서·업종·유효기간만 있고 가격은 없다", () => {
  const preview = documentSharePreview({ companyName: "가짜유통", documentTitle: "11월 단가표", industry: "중식", validUntil: "2026-11-20" });
  expect(preview).toEqual({ title: "가짜유통 · 11월 단가표", description: "중식 업종 · 2026-11-20까지" });
  expect(JSON.stringify(preview)).not.toContain("원");
});
