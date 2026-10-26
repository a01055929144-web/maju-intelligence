import type { CustomerMapSummaryItem, ManagedCompanyAccount, PermitLeadItem } from "@/lib/store";

// CI production-build screenshots need populated pages without connecting to an operating database.
// This flag is set only by the layout-test workflow and is never exposed to the browser.
export function isCiLayoutFixturesEnabled() {
  return process.env.CI_LAYOUT_FIXTURES === "enabled" && process.env.VERCEL_ENV !== "production";
}

const companyId = "00000000-0000-4000-8000-000000000001";

export const ciLayoutCustomers: CustomerMapSummaryItem[] = Array.from({ length: 20 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  customerName: `테스트 거래처 ${String(index + 1).padStart(2, "0")}`,
  address: `서울특별시 강남구 테헤란로 ${index + 1}`,
  region: "서울특별시 강남구",
  grade: index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C",
  monthlyRevenue: 1000000 + index * 10000,
  phone: `010-1234-${String(index + 1).padStart(4, "0")}`
} satisfies CustomerMapSummaryItem));

export const ciLayoutLeads: PermitLeadItem[] = Array.from({ length: 20 }, (_, index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  businessName: `테스트 매장 ${String(index + 1).padStart(2, "0")}`,
  isActive: true,
  openDate: "2026-10-26",
  permitDate: "2026-10-25",
  address: `서울특별시 강남구 역삼동 ${index + 1}`,
  phone: index % 2 === 0 ? `010-5678-${String(index + 1).padStart(4, "0")}` : undefined,
  leadPeriod: "recent",
  industryPrimary: "한식",
  industryTags: ["일반음식점", "한식"],
  isTargetIndustry: true,
  isTemporaryOperation: false,
  isTemporaryOperationSuspected: false,
  isDuplicate: false,
  status: "신규 수집",
  nextActionReasons: [],
  scoreTotal: 80 - index,
  scoreBreakdown: {},
  grade: "B",
  createdAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-26T00:00:00.000Z"
} satisfies PermitLeadItem));

export const ciLayoutCompany: ManagedCompanyAccount = {
  id: companyId,
  name: "CI 화면 점검 회사",
  businessRegistrationNumber: "",
  businessType: "식자재 유통",
  ownerName: "테스트 대표",
  originAddress: "서울특별시 강남구 테헤란로 1",
  status: "active",
  customerEmail: "ci-owner@example.test",
  hasPassword: true,
  customerCount: ciLayoutCustomers.length,
  salesTransactionCount: 0,
  uploadCount: 0,
  recentUploads: [],
  salesAreaCount: 1,
  vehicleCount: 0,
  leadCount: ciLayoutLeads.length,
  mobileLocationCount: 0,
  quoteActionCount: 0,
  leadImportCount: 0,
  subscriptionStatus: "trialing"
};
