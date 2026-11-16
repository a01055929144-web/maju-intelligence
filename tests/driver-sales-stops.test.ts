import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";

const route = readFileSync("app/api/mobile/driver-sales-stops/route.ts", "utf8");
const page = readFileSync("app/mobile/today/page.tsx", "utf8");

afterEach(() => {
  delete process.env.FEATURE_DRIVER_SALES_STOPS;
  delete process.env.FEATURE_DRIVER_SALES_STOPS_COMPANY_IDS;
});

it("CX-46e는 기본 OFF이고 회사 allowlist에서만 열린다", () => {
  expect(isFeatureEnabled("DRIVER_SALES_STOPS", "company-a")).toBe(false);
  process.env.FEATURE_DRIVER_SALES_STOPS_COMPANY_IDS = "company-b,company-a";
  expect(isFeatureEnabled("DRIVER_SALES_STOPS", "company-a")).toBe(true);
  expect(isFeatureEnabled("DRIVER_SALES_STOPS", "company-c")).toBe(false);
});

it("합성 API 계약은 세션 회사와 기사 member로만 정류장을 처리한다", () => {
  expect(route).toContain("auth.customerSession?.companyMemberId");
  expect(route).toContain("company_id=eq.${encodeURIComponent(auth.companyId)}");
  expect(route).toContain("driver_member_id=eq.${encodeURIComponent(auth.customerSession.companyMemberId)}");
  expect(route).toContain('stop_type=eq.sales');
  expect(route).toContain('result: "견적 전달"');
  expect(route).toContain('result: body.outcome === "moved_or_closed" ? "제외" : "거절"');
  expect(page).toContain('isFeatureEnabled("DRIVER_SALES_STOPS", session.companyId)');
});
