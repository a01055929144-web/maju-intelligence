import { describe, expect, it } from "vitest";
import { normalizeStoredMapPanelMode, parseStoredLeadVisibility } from "../lib/map-preferences";

describe("map preferences", () => {
  it("기존 리드 패널 저장값은 거래처 패널로 호환 처리한다", () => {
    expect(normalizeStoredMapPanelMode("newLead")).toBe("customer");
    expect(normalizeStoredMapPanelMode("salesLead")).toBe("customer");
  });

  it("리드 표시 여부는 패널과 독립적으로 복원한다", () => {
    expect(parseStoredLeadVisibility("true")).toBe(true);
    expect(parseStoredLeadVisibility("false")).toBe(false);
    expect(parseStoredLeadVisibility(null)).toBe(false);
  });
});
