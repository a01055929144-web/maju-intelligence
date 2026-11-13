import { describe, expect, it } from "vitest";
import { chooseScope, parseSite } from "../lib/auth-site";

describe("CC-39 prerequisite: site-aware API scope", () => {
  const both = { hasAdmin: true, hasCustomer: true, customerCompanyId: "company-own" };
  it("admin header with both sessions → admin scope (companyId=X handled as admin)", () => {
    expect(chooseScope({ ...both, site: "admin", requestedCompanyId: "company-x" })).toBe("admin");
  });
  it("company header with both sessions → the customer's own company", () => {
    expect(chooseScope({ ...both, site: "company", requestedCompanyId: "company-x" })).toBe("customer");
  });
  it("no header, both sessions, requested company differs → ambiguous", () => {
    expect(chooseScope({ ...both, site: null, requestedCompanyId: "company-x" })).toBe("ambiguous");
  });
  it("no header, same or no requested company → customer first (unchanged rule)", () => {
    expect(chooseScope({ ...both, site: null, requestedCompanyId: "company-own" })).toBe("customer");
    expect(chooseScope({ ...both, site: null })).toBe("customer");
  });
  it("a single session behaves as before whatever the header says", () => {
    expect(chooseScope({ site: "company", hasAdmin: true, hasCustomer: false })).toBe("admin");
    expect(chooseScope({ site: "admin", hasAdmin: false, hasCustomer: true, requestedCompanyId: "x" })).toBe("customer");
    expect(chooseScope({ site: null, hasAdmin: false, hasCustomer: false })).toBe("none");
  });
  it("parses only known site values", () => {
    expect(parseSite("admin")).toBe("admin");
    expect(parseSite("evil")).toBeNull();
    expect(parseSite(null)).toBeNull();
  });
});
