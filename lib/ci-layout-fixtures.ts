import type { CustomerMapSummaryItem, ManagedCompanyAccount, PermitLeadItem } from "@/lib/store";
import type { ProductCatalogAdminItem } from "@/lib/product-catalog-admin";
import type { ProductImportAuditItem } from "@/lib/product-catalog-import";

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

export const ciLayoutProducts: ProductCatalogAdminItem[] = Array.from(
  { length: 18 },
  (_, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    productCode: `ERP-${String(index + 1).padStart(4, "0")}`,
    name: ["깐양파", "냉동 대파", "국산 감자", "참기름", "부침가루", "손질 오징어"][index % 6],
    managementName: index % 3 === 0 ? `매장용 ${index + 1}` : undefined,
    category: ["농산", "냉동", "농산", "조미", "가공", "수산"][index % 6],
    specValue: [10, 1, 20, 1.8, 10, 5][index % 6],
    specUnit: ["kg", "kg", "kg", "L", "kg", "kg"][index % 6],
    unit: ["망", "봉", "박스", "병", "포", "박스"][index % 6],
    purchaseUnit: ["망", "봉", "박스", "병", "포", "박스"][index % 6],
    salesUnit: ["kg", "봉", "kg", "병", "kg", "kg"][index % 6],
    purchasePrice: 9000 + index * 850,
    salesPrice: 12000 + index * 1100,
    taxType: index % 3 === 0 ? "exempt" : "taxable",
    isActive: index % 7 !== 0,
    matchStatus: "matched",
    linkedSupplierCount: 1 + (index % 3),
    hasUnconfirmedConversion: index === 5,
    supplierNames: [["한빛유통"], ["새봄푸드"], ["우리농산", "한빛유통"]][index % 3],
    trackingEnabled: index % 4 !== 0,
    onHand: 14 + index * 3,
    barcodes: [`88000000${String(index + 1).padStart(5, "0")}`],
    createdAt: `2026-10-${String(10 + (index % 18)).padStart(2, "0")}T09:00:00.000Z`,
  }),
);

export const ciLayoutProductImports: ProductImportAuditItem[] = [
  { id: "import-1", supplierName: "한빛유통", fileName: "한빛유통_11월_단가표.xlsx", status: "completed", totalRows: 286, createdCount: 32, updatedCount: 248, excludedCount: 6, warningCount: 3, createdByName: "김관리", createdAt: "2026-11-02T00:14:00.000Z", completedAt: "2026-11-02T00:15:18.000Z" },
  { id: "import-2", supplierName: "새봄푸드", fileName: "새봄푸드_냉동식품.csv", status: "completed", totalRows: 154, createdCount: 18, updatedCount: 134, excludedCount: 2, warningCount: 0, createdByName: "박운영", createdAt: "2026-11-01T06:22:00.000Z", completedAt: "2026-11-01T06:22:42.000Z" },
  { id: "import-3", supplierName: "동해수산", fileName: "동해수산_단가_수정.xlsx", status: "failed", totalRows: 97, createdCount: 0, updatedCount: 0, excludedCount: 0, warningCount: 12, createdByName: "김관리", createdAt: "2026-10-31T02:08:00.000Z", errorMessage: "원가 열에서 숫자가 아닌 값이 발견되었습니다." },
  { id: "import-4", supplierName: "우리농산", fileName: "우리농산_채소_주간.xlsx", status: "completed", totalRows: 412, createdCount: 5, updatedCount: 401, excludedCount: 6, warningCount: 1, createdByName: "이담당", createdAt: "2026-10-30T23:40:00.000Z", completedAt: "2026-10-30T23:42:11.000Z" },
];

export const ciLayoutCompany: ManagedCompanyAccount = {
  id: companyId,
  name: "CI 화면 점검 회사",
  businessRegistrationNumber: "",
  businessType: "식자재 유통",
  ownerName: "테스트 대표",
  originAddress: "서울특별시 강남구 테헤란로 1",
  companyKind: "customer" as const,
  status: "active",
  customerEmail: "ci-owner@example.test",
  hasPassword: true,
  customerCount: ciLayoutCustomers.length,
  salesTransactionCount: 0,
  uploadCount: 2,
  lastUploadAt: "2026. 11. 2. 오후 2:30:00",
  recentUploads: [
    { id: "ci-customer-import", company: "CI 반응형 식자재", companyId, filename: "거래처_기초자료.xlsx", reportId: "", rows: 128, status: "completed", qualityScore: 96, duplicateCount: 3, healthScore: 94, createdAt: "2026. 11. 2. 오후 2:30:00", createdAtIso: "2026-11-02T05:30:00.000Z", uploadSource: "customer" },
    { id: "ci-admin-import", company: "CI 반응형 식자재", companyId, filename: "상품_초기등록.xlsx", reportId: "", rows: 74, status: "completed", qualityScore: 100, duplicateCount: 0, healthScore: 100, createdAt: "2026. 11. 2. 오후 1:15:00", createdAtIso: "2026-11-02T04:15:00.000Z", uploadSource: "admin", actorName: "MAJU 운영팀", targetType: "product" }
  ],
  salesAreaCount: 1,
  vehicleCount: 0,
  leadCount: ciLayoutLeads.length,
  mobileLocationCount: 0,
  quoteActionCount: 0,
  leadImportCount: 0,
  subscriptionStatus: "trialing"
};
