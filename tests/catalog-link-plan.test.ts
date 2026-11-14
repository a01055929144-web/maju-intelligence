import { describe, expect, it } from "vitest";
import { summarizeCatalogChange } from "../lib/pricing/catalog-link-plan";

const names = new Map([["a", "도매A"], ["b", "도매B"]]);
const nameOf = (id: string | null) => (id ? names.get(id) ?? "?" : "기본");
const stores = [
  { id: "1", templateId: null }, { id: "2", templateId: null }, { id: "3", templateId: "a" }, { id: "4", templateId: "b" }, { id: "5", templateId: "b" },
];

describe("catalog change summary (CC-32d)", () => {
  it("counts changing stores by their current catalog and skips ones already on the target", () => {
    const plan = summarizeCatalogChange(stores, ["1", "2", "3", "4", "5"], "b", nameOf);
    expect(plan.total).toBe(5);
    expect(plan.unchanged).toBe(2);
    expect(plan.changing).toEqual(["1", "2", "3"]);
    expect(plan.from).toEqual([{ name: "기본", count: 2 }, { name: "도매A", count: 1 }]);
  });
  it("target null means the default catalog", () => {
    const plan = summarizeCatalogChange(stores, ["1", "3"], null, nameOf);
    expect(plan.changing).toEqual(["3"]);
    expect(plan.unchanged).toBe(1);
  });
  it("ignores selected ids that are not in the list", () => {
    expect(summarizeCatalogChange(stores, ["x"], "a", nameOf).total).toBe(0);
  });
});
