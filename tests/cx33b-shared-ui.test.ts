import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "components/company-profile-form.tsx",
  "app/admin/companies/workspace.tsx",
  "app/crm/timeline/page.tsx",
  "app/dashboard/settings/staff-management-panel.tsx",
  "app/reports/[id]/report-actions.tsx",
  "components/instagram-candidate-finder.tsx",
  "components/lead-contact-channels-panel.tsx",
  "components/mobile-delivery-proof-panel.tsx",
  "components/mobile-route-action-panel.tsx",
  "components/today-course-view.tsx"
];

const read = (path: string) => readFileSync(path, "utf8");

describe("CX-33b shared UI follow-up", () => {
  it("routes clipboard writes through the shared helper and documents raw API exceptions", () => {
    const rawLines = files.flatMap((path) => {
      const lines = read(path).split("\n");
      return lines.flatMap((line, index) => /window\.confirm|navigator\.clipboard/.test(line) ? [{ line, previous: lines[index - 1] || "" }] : []);
    });
    expect(rawLines).toHaveLength(2);
    expect(rawLines.every(({ previous }) => previous.includes("shared-ui-exception:"))).toBe(true);
    expect(rawLines.some(({ line }) => line.includes("window.confirm"))).toBe(true);
    expect(rawLines.some(({ line }) => line.includes("navigator.clipboard.readText"))).toBe(true);
  });

  it("keeps search roles and ten-thousand-won labels on shared formatting", () => {
    for (const path of ["components/company-profile-form.tsx", "app/admin/companies/workspace.tsx", "app/dashboard/settings/staff-management-panel.tsx"]) {
      expect(read(path)).not.toContain('role: "textbox"');
    }
    expect(read("app/crm/timeline/page.tsx")).toContain("formatNumber(selectedCustomer.monthlyRevenue)");
    expect(read("components/today-course-view.tsx").match(/formatNumber\(store\.expectedRevenue\)/g)).toHaveLength(2);
  });
});
