import { expect, it } from "vitest";
import { autoSelectCurrentPurchaseIds } from "../domains/pricing/purchase-upload-selection";

it("automatically selects only valid changed current prices while leaving equal and zero rows for history", () => {
  const current = new Map([["changed", 100], ["same", 100], ["zero", 100], ["new", 0]]);
  expect(autoSelectCurrentPurchaseIds({ changed: { cost: 120 }, same: { cost: 100 }, zero: { cost: 0 }, new: { cost: 50 } }, current))
    .toEqual(["changed", "new"]);
});
