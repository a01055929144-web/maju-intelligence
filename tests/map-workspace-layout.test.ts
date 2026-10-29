import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
const shellSource = readFileSync("components/customer-app-shell.tsx", "utf8");
const deliveryProofSource = readFileSync("components/mobile-delivery-proof-panel.tsx", "utf8");
const dashboardSource = readFileSync("app/dashboard/page.tsx", "utf8");
const mapControlsSource = readFileSync("components/map-corner-controls.tsx", "utf8");
const mapDrawerSource = readFileSync("components/map-store-detail-drawer.tsx", "utf8");
const mapLeadChannelsSource = readFileSync("components/map-lead-channel-icons.tsx", "utf8");

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
    expect(workspaceSource).toContain("이 조건 저장");
    expect(workspaceSource).toContain("저장한 필터");
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
    expect(workspaceSource).toContain("max-w-[96px] shrink-0");
    expect(workspaceSource).toContain('aria-label="바꿀 단계"');
    expect(workspaceSource).toContain("runMapLeadStageBulk(");
    expect(workspaceSource).toContain("setSelectedLeadIds(new Set(failed.map");
    expect(workspaceSource).toContain('body: JSON.stringify({ actionType: "status", memo, result: status })');
  });
});

describe("시안 ⑫ 남은 지도 상호작용", () => {
  it("keeps the store detail in a separate right-side 62 percent drawer", () => {
    expect(mapDrawerSource).toContain("md:w-[62%]");
    expect(mapDrawerSource).toContain('title="문자"');
    expect(mapDrawerSource).toContain('title="DM 문안 준비"');
    expect(mapDrawerSource).toContain('title="길안내"');
    expect(mapDrawerSource).toContain('title="단계"');
    expect(mapDrawerSource).toContain('title="새 창"');
    expect(workspaceSource).toContain("<MapStoreDetailDrawer");
  });

  it("places current-location and zoom controls at the map bottom-right", () => {
    expect(mapControlsSource).toContain("absolute bottom-3");
    expect(mapControlsSource).toContain('aria-label="현재 위치"');
    expect(mapControlsSource).toContain('aria-label="지도 확대"');
    expect(mapControlsSource).toContain('aria-label="지도 축소"');
  });

  it("supports six accessible 26px lead contact channel icons", () => {
    expect(mapLeadChannelsSource).toContain("h-[26px] w-[26px]");
    for (const label of ["휴대폰", "인스타", "톡톡", "이메일", "팩스", "매장전화"]) {
      expect(mapLeadChannelsSource).toContain(`title="${label}"`);
    }
    expect(workspaceSource).toContain("<MapLeadChannelIcons lead={lead} />");
    expect(workspaceSource).toContain('title="네이버 지도"');
    expect(workspaceSource).toContain('title="카카오맵"');
    expect(workspaceSource).toContain('title="구글 지도"');
  });

  it("opens customer detail on the core dashboard and preserves phone and email actions", () => {
    expect(workspaceSource).toContain("/dashboard?routeMode=map&customer=");
    expect(dashboardSource).toContain("initialCustomerId={params.customer}");
    expect(workspaceSource).toContain('const [selectedId, setSelectedId] = useState(initialCustomerId || "")');
    expect(workspaceSource).toContain("const selectedStore = allStores.find((store) => store.id === selectedId)");
    expect(mapDrawerSource).toContain('title="매장전화"');
    expect(mapDrawerSource).toContain('title="이메일"');
    expect(mapDrawerSource).toContain("const canSms = isMobilePhoneNumber(phone)");
    expect(mapLeadChannelsSource).toContain("isMobilePhoneNumber(lead.phone)");
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

describe("시안 ⑫ 필터 줄 · 격자", () => {
  it("uses chip popovers, a static full-width filter row and flush side panels", () => {
    expect(workspaceSource).toContain('placeholder="상호·주소·전화"');
    expect(workspaceSource).toContain("data-map-filter-chip");
    expect(workspaceSource).toContain('label: "규모(평)", muted: true');
    expect(workspaceSource).not.toContain("lg:absolute lg:inset-x-2 lg:top-2 lg:z-20");
    expect(workspaceSource).toContain('"lg:left-[250px]"');
    expect(workspaceSource).toContain('"lg:right-[340px]"');
    expect(workspaceSource).toContain('aria-label="보기 방식"');
    expect(workspaceSource).toContain('aria-label="현재 필터 조건"');
  });

  it("keeps multi-select filters backward compatible with single saved values", async () => {
    const { areaLabelMatchesSigungu, splitMultiFilter, summarizeMultiFilter, toggleMultiFilter } = await import("../lib/map-filter-multi");
    expect(splitMultiFilter("")).toEqual([]);
    expect(splitMultiFilter("한식")).toEqual(["한식"]);
    expect(toggleMultiFilter("한식", "일식")).toBe("한식|일식");
    expect(toggleMultiFilter("한식|일식", "한식")).toBe("일식");
    expect(summarizeMultiFilter("강남구|서초구|송파구", "영업 지역")).toBe("강남구 +2");
    expect(summarizeMultiFilter("", "영업 지역")).toBe("영업 지역");
    expect(areaLabelMatchesSigungu("서울특별시 강남구", "강남구")).toBe(true);
    expect(areaLabelMatchesSigungu("인천광역시 부평구", "강남구")).toBe(false);
  });
});
