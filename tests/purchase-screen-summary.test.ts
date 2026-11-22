import { describe, expect, it } from "vitest";
import { currentPurchaseDelta, purchaseCandidateCounts, sameUnitPurchaseGroups } from "../domains/pricing/purchase-screen-summary";

describe("purchase screen current comparison", () => {
  it("uses current purchase price for same, up, down and missing current price", () => {
    expect(currentPurchaseDelta(2000, { cost: 2000 })).toEqual({ amount: 0, rate: 0 });
    expect(currentPurchaseDelta(2000, { cost: 2500 })).toEqual({ amount: 500, rate: 25 });
    expect(currentPurchaseDelta(2000, { cost: 1500 })).toEqual({ amount: -500, rate: -25 });
    expect(currentPurchaseDelta(0, { cost: 1500 })).toEqual({ amount: 1500, rate: null });
    expect(currentPurchaseDelta(2000)).toBeNull();
  });

  it("excludes invalid zero prices and keeps changed equal to up plus down plus review", () => {
    expect(currentPurchaseDelta(2000, { cost: 0 })).toBeNull();
    expect(currentPurchaseDelta(2000, { cost: -1 })).toBeNull();
    const products = [1, 2, 3, 4, 5].map(id => ({ id: String(id), cost: 2000 }));
    expect(purchaseCandidateCounts(products, {
      "1": { cost: 2500 }, "2": { cost: 1500 }, "3": { cost: 2000 },
      "4": { cost: 2000, reviewOnly: true }, "5": { cost: 0 }
    })).toEqual({ changed: 3, up: 1, down: 1, review: 1 });
  });
});

it("groups only identical supplier, product and unit without accepting an unconfirmed conversion", () => {
  const lines = [
    { rowNumber: 1, productId: "a", supplier: "S", unit: " EA " },
    { rowNumber: 2, productId: "a", supplier: "S", unit: "ea" },
    { rowNumber: 3, productId: "a", supplier: "T", unit: "EA" },
    { rowNumber: 4, productId: "a", supplier: "S", unit: "BOX" },
    { rowNumber: 5, productId: "a", supplier: "S", unit: "" }
  ];
  expect(sameUnitPurchaseGroups(lines, new Map([["a", "ea"]])).map(group => group.rows)).toEqual([[1, 2], [3]]);
});
