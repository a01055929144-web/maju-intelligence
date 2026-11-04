import { describe, expect, it } from "vitest";
import { filterIndex } from "../components/pricing-product-picker";

const items = [
  { id: "1", code: "P-000001", name: "양파", displayName: "", spec: "10kg", unit: "BOX" },
  { id: "2", code: "P-000002", name: "대파", displayName: "흙대파", spec: "1kg", unit: "단" },
];
const none = { all: "", code: "", name: "", spec: "", unit: "" };
describe("picker filter", () => {
  it("filters by any field and by detail fields", () => {
    expect(filterIndex(items, { ...none, all: "p-000002" }).map((i) => i.id)).toEqual(["2"]);
    expect(filterIndex(items, { ...none, name: "흙" }).map((i) => i.id)).toEqual(["2"]);
    expect(filterIndex(items, { ...none, spec: "10 kg" }).map((i) => i.id)).toEqual(["1"]);
    expect(filterIndex(items, { ...none, unit: "단" }).map((i) => i.id)).toEqual(["2"]);
    expect(filterIndex(items, none)).toHaveLength(2);
  });
});
