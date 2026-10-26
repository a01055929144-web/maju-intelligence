import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync("components/sales-route-map-workspace.tsx", "utf8");

describe("PC map workspace layout", () => {
  it("keeps the primary filter bar on one desktop row", () => {
    expect(workspaceSource).toContain("lg:grid-cols-[minmax(180px,280px)_minmax(0,1fr)]");
    expect(workspaceSource).toContain("maju-toolbar-scroll flex min-w-0 flex-nowrap");
  });

  it("places working layer controls at the upper-left of the map", () => {
    expect(workspaceSource).toContain('aria-label="지도 레이어"');
    expect(workspaceSource).toContain('onSelectLeadLayer("new")');
    expect(workspaceSource).toContain('onSelectLeadLayer("sales")');
    expect(workspaceSource).toContain("headerOffsetPx + 12");
  });

  it("collapses the assignment panel without changing its selected filter", () => {
    expect(workspaceSource).toContain("onToggleCollapsed={() => setLeftCollapsed((collapsed) => !collapsed)}");
    expect(workspaceSource).toContain('leftCollapsed ? "lg:w-14"');
    expect(workspaceSource).not.toContain('onToggleCollapsed={() => setMapPanelMode(leftCollapsed ? "driver" : "map")}');
  });

  it("keeps lead card controls fixed-width and exposes guarded bulk stage changes", () => {
    expect(workspaceSource).toContain('aria-label={`${lead.businessName} 선택`}');
    expect(workspaceSource).toContain('className="h-8 w-[92px] shrink-0');
    expect(workspaceSource).toContain('aria-label="바꿀 단계"');
    expect(workspaceSource).toContain("runMapLeadStageBulk(");
    expect(workspaceSource).toContain("setSelectedLeadIds(new Set(failed.map");
    expect(workspaceSource).toContain('body: JSON.stringify({ actionType: "status", memo, result: status })');
  });
});
