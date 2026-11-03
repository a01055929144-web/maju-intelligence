import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAFF_DUTIES, STAFF_DUTY_LABELS } from "../domains/organization/staff-access";

describe("settings restructure (11/3)", () => {
  it("adds office and other duties", () => {
    expect(STAFF_DUTIES).toEqual(["sales", "delivery", "office", "other"]);
    expect(STAFF_DUTY_LABELS.office).toBe("사무(내근)");
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
