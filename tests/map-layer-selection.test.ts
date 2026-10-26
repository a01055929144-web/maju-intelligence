import { describe, expect, it } from "vitest";
import { nextLeadLayerSelection } from "../lib/map-layer-selection";

describe("map lead layer selection", () => {
  it("turns on one lead layer without changing a panel mode", () => {
    expect(nextLeadLayerSelection(false, "all", "new")).toEqual({ visible: true, type: "new" });
  });

  it("allows new and sales layers to be toggled independently", () => {
    expect(nextLeadLayerSelection(true, "new", "sales")).toEqual({ visible: true, type: "all" });
    expect(nextLeadLayerSelection(true, "all", "new")).toEqual({ visible: true, type: "sales" });
    expect(nextLeadLayerSelection(true, "sales", "sales")).toEqual({ visible: false, type: "sales" });
  });
});
