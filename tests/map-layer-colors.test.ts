import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leadLayerColor, listTabColor, MAP_GRADE_COLORS, MAP_LAYER_COLORS } from "../domains/route/map-layer-colors";
import { mapCustomerNotices } from "../domains/route/map-customer-notice";

const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
const whiteContrast = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe("지도 색 기준 한 곳 (48-1b)", () => {
  it("레이어 색: 거래처 파랑 · 신규 보라 · 영업 청록 · 차량 초록 · 서로 다름", () => {
    expect(MAP_LAYER_COLORS.customer).toBe("#2563eb");
    expect(MAP_LAYER_COLORS.newLead).toBe("#7c3aed");
    expect(MAP_LAYER_COLORS.salesLead).toBe("#0f766e");
    expect(new Set(Object.values(MAP_LAYER_COLORS)).size).toBe(Object.keys(MAP_LAYER_COLORS).length);
  });
  it("리드 종류·목록 탭 값이 레이어 색을 그대로 돌려준다(신규 선택 탭 = 보라)", () => {
    expect(leadLayerColor("new")).toBe(MAP_LAYER_COLORS.newLead);
    expect(leadLayerColor("sales")).toBe(MAP_LAYER_COLORS.salesLead);
    expect(listTabColor("new")).toBe(MAP_LAYER_COLORS.newLead);
    expect(listTabColor("sales")).toBe(MAP_LAYER_COLORS.salesLead);
    expect(listTabColor("customers")).toBe(MAP_LAYER_COLORS.customer);
  });
  it("등급 A 배지는 신규·영업·차량·미등록 색과 겹치지 않는다(예전 A 보라 = 신규 색)", () => {
    for (const key of ["newLead", "salesLead", "vehicle", "unregistered"] as const) expect(MAP_GRADE_COLORS.A).not.toBe(MAP_LAYER_COLORS[key]);
    expect(MAP_GRADE_COLORS.A).not.toBe("#7c3aed");
  });
  it("흰 글자 대비 4.5:1 이상(선택 탭·배지·등급 배지 글자는 흰색 — 차량·미등록은 글자 없는 점/이모지라 제외)", () => {
    for (const hex of [MAP_LAYER_COLORS.customer, MAP_LAYER_COLORS.newLead, MAP_LAYER_COLORS.salesLead, MAP_GRADE_COLORS.A, MAP_GRADE_COLORS.B, MAP_GRADE_COLORS.C]) expect(whiteContrast(hex)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("지도 화면이 이 기준을 쓴다 (소스 확인)", () => {
  const workspace = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
  const detail = readFileSync("components/map/map-place-detail.tsx", "utf8");
  const kakao = readFileSync("components/kakao-address-map.tsx", "utf8");
  it("색 HEX를 화면 파일에 다시 적지 않는다", () => {
    expect(workspace).not.toContain('"new" ? "#7c3aed" : "#0f766e"'); // 리드 마커 색(차량별 팔레트의 보라는 차량 구분용이라 별개)
    expect(workspace).toContain("markerColor: leadLayerColor(");
    expect(workspace).toContain("listTabColor(tab.value)");
    expect(kakao).not.toContain('"background:#7c3aed');
    expect(detail).not.toContain("bg-violet-700");
    expect(detail).toContain("MAP_LAYER_COLORS.customer");
  });
  it("레이어 바 거래처는 켜고 끄는 버튼(aria-pressed)이고 꺼 두면 거래처 마커만 뺀다", () => {
    expect(workspace).toContain("aria-pressed={customersOn}");
    expect(workspace).toContain('markers.filter((marker) => marker.tone !== "customer")');
    expect(workspace).not.toContain("거래처 레이어(항상 표시)");
  });
  it("이미 선택된 목록 탭을 다시 누르면 패널을 접는다", () => {
    expect(workspace).toContain("tab === activeTab && !rightCollapsed");
  });
  it("거래처 안내는 지도 위가 아니라 거래처 목록 맨 위로", () => {
    const sidePanel = readFileSync("components/map/map-side-panel.tsx", "utf8");
    expect(sidePanel).toContain("{notice}");
    expect(workspace).toContain("notice={sourceReady ? <MapCustomerNotice");
    expect(workspace).not.toMatch(/<MapCustomerNotice\n\s+approximateCount/);
  });
  it("목록 안 안내(inline)는 0곳일 때 올리기 안내를 빼고(빈 화면이 안내함), 1곳·위치 문제는 한 줄로", () => {
    expect(mapCustomerNotices(0, 0).some((n) => n.upload)).toBe(true);
    expect(mapCustomerNotices(1, 0).some((n) => n.upload)).toBe(true);
    const notice = readFileSync("components/map/map-customer-notice.tsx", "utf8");
    expect(notice).toContain("inline && notice.upload && customerCount === 0");
  });
});
