import { describe, expect, it } from "vitest";
import { normalizeCompanyKind } from "../lib/store";

describe("company kind", () => {
  it("keeps the three kinds and falls back to customer", () => {
    expect(["pilot", "internal", "customer", null, undefined, "hq", ""].map(normalizeCompanyKind)).toEqual(["pilot", "internal", "customer", "customer", "customer", "customer", "customer"]);
  });
});
