import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAFF_DUTIES, STAFF_DUTY_LABELS } from "../domains/organization/staff-access";

describe("settings restructure (11/3)", () => {
  it("adds office and other duties", () => {
    expect(STAFF_DUTIES).toEqual(["sales", "delivery", "office", "other"]);
    expect(STAFF_DUTY_LABELS.office).toBe("사무");
  });
  it("keeps home highlight exact and maps settings tabs to 회사 정보", () => {
    const sidebar = readFileSync(resolve(process.cwd(), "components/app-sidebar.tsx"), "utf8");
    expect(sidebar).toContain('hrefPath === "/dashboard") && pathname !== hrefPath');
  });
  it("puts 문자 발송 next to 고급 설정 and order settings inside 회사 정보", () => {
    const shell = readFileSync(resolve(process.cwd(), "app/dashboard/settings/settings-shell.tsx"), "utf8");
    expect(shell.indexOf('"고급 설정"')).toBeLessThan(shell.indexOf('"문자 발송"'));
    const order = readFileSync(resolve(process.cwd(), "app/revenue/pricing/order-settings/page.tsx"), "utf8");
    expect(order).toContain('redirect("/dashboard/settings/company?tab=order")');
  });
});

describe("settings round 3 (11/3 22:54)", () => {
  it("orders company tabs basic(+documents) > products > order > delivery", async () => {
    const { COMPANY_PROFILE_SECTIONS } = await import("../domains/organization/company-profile");
    expect(COMPANY_PROFILE_SECTIONS.map((section) => section.id)).toEqual(["basic", "products", "delivery", "payment", "consult", "admin"]);
    expect(COMPANY_PROFILE_SECTIONS[0].fields.some((field) => field.key === "business_certificate_path")).toBe(true);
    const form = readFileSync(resolve(process.cwd(), "components/company-profile-form.tsx"), "utf8");
    expect(form).toContain('section.id === "products"');
  });
  it("adds 영업 정보 next to 회사 정보 and shows MAJU brand with company name at the bottom", () => {
    const shell = readFileSync(resolve(process.cwd(), "app/dashboard/settings/settings-shell.tsx"), "utf8");
    expect(shell.indexOf('"회사 정보"')).toBeLessThan(shell.indexOf('"영업 정보"'));
    const customerShell = readFileSync(resolve(process.cwd(), "components/customer-app-shell.tsx"), "utf8");
    expect(customerShell).toContain('brand="MAJU" context=""');
    expect(customerShell).toContain("liveCompanyName");
  });
  it("keeps sidebar state in memory between pages", () => {
    const sidebar = readFileSync(resolve(process.cwd(), "components/app-sidebar.tsx"), "utf8");
    expect(sidebar).toContain("sidebarMemory");
    expect(sidebar).not.toContain("groupSelected || !closedGroups");
  });
});
