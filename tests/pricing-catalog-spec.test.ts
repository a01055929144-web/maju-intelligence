import { expect, it } from "vitest";
import { catalogDisplaySpec, fillBlankDocumentSpecs, lineFromCatalog } from "../domains/pricing/document";

it("uses the sales spec first and falls back to the catalog size", () => {
  expect(catalogDisplaySpec({ sales_spec: " 1.8L ", spec_value: 18, spec_unit: "L" })).toBe("1.8L");
  expect(catalogDisplaySpec({ sales_spec: null, spec_value: 18, spec_unit: "L" })).toBe("18L");
  expect(catalogDisplaySpec({ sales_spec: null, spec_value: null, spec_unit: "L" })).toBe("");
  expect(lineFromCatalog({ id: "a", name: "미림", displayName: "미림", brand: "", spec: "18L", unit: "통", price: 1000, taxType: "taxable" }).spec).toBe("18L");
});

it("fills only missing draft specs and leaves an existing snapshot alone", () => {
  const catalog = { id: "a", name: "미림", displayName: "미림", brand: "", spec: "18L", unit: "통", price: 1000, taxType: "taxable" as const };
  const line = lineFromCatalog({ ...catalog, spec: "" });
  expect(fillBlankDocumentSpecs([line], [catalog])[0].spec).toBe("18L");
  expect(fillBlankDocumentSpecs([{ ...line, spec: "1.8L" }], [catalog])[0].spec).toBe("1.8L");
});
