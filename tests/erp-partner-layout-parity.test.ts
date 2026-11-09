import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerPage = readFileSync("app/crm/timeline/page.tsx", "utf8");
const supplierPage = readFileSync("app/purchasing/suppliers/page.tsx", "utf8");
const supplierWorkspace = readFileSync("components/product-supplier-workspace.tsx", "utf8");
const toolbar = readFileSync("components/erp-partner-directory-toolbar.tsx", "utf8");

describe("ERP partner directory layout parity", () => {
  it("uses the same directory toolbar for customer and supplier lists", () => {
    expect(customerPage).toContain("<ErpPartnerDirectoryToolbar");
    expect(supplierWorkspace).toContain("<ErpPartnerDirectoryToolbar");
    expect(toolbar).toContain("sm:flex-row sm:items-center sm:justify-between");
    expect(toolbar).toContain("min-h-11 w-full");
  });

  it("keeps the supplier wireframe fields in a responsive master-detail layout", () => {
    for (const label of ["매입처명", "상품 수", "원가 확정률", "최근 업로드", "상태"]) {
      expect(supplierWorkspace).toContain(label);
    }
    expect(supplierWorkspace).toContain("xl:grid-cols-[360px_minmax(0,1fr)]");
    expect(supplierWorkspace).toContain("<aside");
    expect(supplierWorkspace).toContain("검색 조건에 맞는 매입처가 없습니다.");
    expect(supplierWorkspace).toContain("등록된 매입처가 없습니다.");
  });

  it("distinguishes load errors and preserves the existing permission boundary", () => {
    expect(supplierPage).toContain('customerHasCapability(customerSession, "manage_sales")');
    expect(supplierPage).toContain('redirect("/dashboard")');
    expect(supplierPage).toContain("loadError = \"매입처 목록을 불러오지 못했습니다.");
    expect(supplierWorkspace).toContain("onRetry={loadError ? () => window.location.reload() : undefined}");
    expect(customerPage).toContain('error={customerSource === "error" ? customerLoadError : undefined}');
  });
});
