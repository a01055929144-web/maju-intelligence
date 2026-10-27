import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
const shellSource = readFileSync("components/customer-app-shell.tsx", "utf8");
const deliveryProofSource = readFileSync("components/mobile-delivery-proof-panel.tsx", "utf8");

describe("PC map workspace layout", () => {
  it("uses the finalized C3 labels without a duplicate map title", () => {
    expect(workspaceSource).toContain('label: "배송 이력"');
    expect(workspaceSource).not.toContain("오늘의 운영 지도");
  });

  it("keeps settings at the bottom of the sidebar instead of duplicating a footer shortcut", () => {
    expect(shellSource).toContain('group.label === "설정" ? "mt-auto');
    expect(shellSource).not.toContain("const settingsHref");
  });

  it("records location confirmation without exposing raw GPS coordinates", () => {
    expect(deliveryProofSource).toContain("위치 확인: 배송 완료 시점에 확인됨");
    expect(deliveryProofSource).not.toContain("www.google.com/maps?q=");
    expect(deliveryProofSource).not.toContain("위치 태그:");
  });

  it("wires saved filter restore controls while the server flag remains authoritative", () => {
    expect(workspaceSource).toContain('fetch("/api/map/filter-presets"');
    expect(workspaceSource).toContain('aria-label="저장된 지도 필터"');
    expect(workspaceSource).toContain("applyMapFilterPreset");
    expect(workspaceSource).toContain("removeSelectedMapFilterPreset");
  });

  it("keeps the primary filter bar on one desktop row", () => {
    expect(workspaceSource).toContain("lg:grid-cols-[minmax(180px,280px)_minmax(0,1fr)]");
    expect(workspaceSource).toContain("maju-toolbar-scroll flex min-w-0 flex-1 flex-nowrap");
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

describe("시안 ⑫ 지도 기본 배치", () => {
  it("defaults to the 3-pane split with a lead list on the right", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
    expect(source).toContain('useState<MapPanelMode>("split")');
    expect(source).toContain('const MAP_PANEL_MODE_STORAGE_KEY = "maju:map-panel-mode:v2"');
    expect(source).toContain("function SplitListTabs(");
    expect(source).toContain('label: "코스"');
    expect(source).toContain('workspaceViews.filter((item) => item.value !== "leads")');
  });
});
