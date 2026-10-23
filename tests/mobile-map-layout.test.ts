import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
const mobileSalesSource = readFileSync("components/mobile-sales-workspace.tsx", "utf8");

describe("mobile map layout", () => {
  it("keeps dashboard controls collapsed and exposes sales areas in a bottom sheet", () => {
    expect(dashboardSource).toContain("mobileMapControlsOpen");
    expect(dashboardSource).toContain("mobileSalesAreaOpen");
    expect(dashboardSource).toContain('role="dialog" aria-modal="true" aria-label="영업 지역 선택"');
    expect(dashboardSource).toContain("h-[calc(100dvh-10rem)]");
  });

  it("places the mobile sales map before KPI cards and sizes it from the viewport", () => {
    expect(mobileSalesSource).toContain('order-1 overflow-hidden rounded-xl border" id="lead-map"');
    expect(mobileSalesSource).toContain('order-2 rounded-xl border p-3" aria-label="영업 KPI 현황"');
    expect(mobileSalesSource).toContain("h-[clamp(360px,calc(100dvh-14rem),620px)]");
  });
});
