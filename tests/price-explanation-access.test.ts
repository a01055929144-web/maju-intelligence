import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canManagePriceSheets: vi.fn(),
  customerHasCapability: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  searchOptions: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));
vi.mock("@/lib/auth", () => ({
  getCustomerSession: vi.fn(async () => ({ companyId: "company-a", companyName: "고객사", name: "사용자" })),
  getAdminSession: vi.fn(async () => null),
  resolvePageCompanyId: vi.fn(() => "company-a"),
  customerHasCapability: mocks.customerHasCapability,
}));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: mocks.canManagePriceSheets }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: vi.fn(() => true) }));
vi.mock("@/lib/pricing/price-explanation", () => ({
  searchPriceExplanationOptions: mocks.searchOptions,
  readPriceExplanation: vi.fn(),
}));
vi.mock("@/lib/pricing/store-price-usage", () => ({ companyUsesStorePrices: vi.fn() }));
vi.mock("@/components/customer-app-shell", () => ({ CustomerAppShell: () => null }));
vi.mock("@/components/pricing-tabs", () => ({ PricingTabs: () => null }));

import PriceExplanationPage from "../app/revenue/pricing/explanation/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canManagePriceSheets.mockReturnValue(true);
  mocks.customerHasCapability.mockReturnValue(false);
});

it("denies a customer without sales-management permission before reading price data", async () => {
  await expect(PriceExplanationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.notFound).toHaveBeenCalledOnce();
  expect(mocks.searchOptions).not.toHaveBeenCalled();
});
