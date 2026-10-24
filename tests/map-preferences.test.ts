import { describe, expect, it } from "vitest";
import { normalizeStoredMapPanelMode } from "../lib/map-preferences";

describe("map preferences", () => {
  it("기존 리드 패널 저장값은 거래처 패널로 호환 처리한다", () => {
    expect(normalizeStoredMapPanelMode("newLead")).toBe("customer");
    expect(normalizeStoredMapPanelMode("salesLead")).toBe("customer");
  });
});
