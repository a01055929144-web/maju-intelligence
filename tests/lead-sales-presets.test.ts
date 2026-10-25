import { describe, expect, it } from "vitest";
import { LEAD_SALES_PRESETS } from "../domains/lead/sales-presets";

describe("lead sales presets", () => {
  it("defines evidence-based timing only for restaurant food distribution", () => {
    const food = LEAD_SALES_PRESETS.find((preset) => preset.key === "food_distribution");
    const distributor = LEAD_SALES_PRESETS.find((preset) => preset.key === "distributor_target");

    expect(food?.contactTiming).toMatchObject({ startDay: 0, endDay: 60 });
    expect(food?.contactTiming?.rationale).toContain("공급처");
    expect(food?.quoteContent).toContain("품목");
    expect(distributor?.contactTiming).toBeNull();
    expect(distributor?.quoteContent).toContain("거래 조건");
  });
});
