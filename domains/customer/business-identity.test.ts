import { describe, expect, it } from "vitest";
import { buildCustomerBusinessKey, hasSubBusinessNumberConflict, parseCustomerBusinessIdentity } from "./business-identity";

describe("customer business identity", () => {
  it("normalizes optional business fields without changing empty legacy records", () => {
    expect(parseCustomerBusinessIdentity({})).toEqual({ ok: true, value: {} });
    expect(parseCustomerBusinessIdentity({
      businessName: " 합성 주식회사 ",
      subBusinessNumber: "0002",
      businessEntityType: "corporation",
      corporateRegistrationNumber: "123456-7890123"
    })).toEqual({
      ok: true,
      value: {
        businessName: "합성 주식회사",
        subBusinessNumber: "0002",
        businessEntityType: "corporation",
        corporateRegistrationNumber: "1234567890123"
      }
    });
  });

  it("rejects invalid sub-business, entity and corporate numbers", () => {
    expect(parseCustomerBusinessIdentity({ subBusinessNumber: "002" })).toMatchObject({ ok: false });
    expect(parseCustomerBusinessIdentity({ businessEntityType: "public" })).toMatchObject({ ok: false });
    expect(parseCustomerBusinessIdentity({ corporateRegistrationNumber: "123" })).toMatchObject({ ok: false });
  });

  it("keeps the legacy key, separates sub-businesses, and preserves exemptions", () => {
    expect(buildCustomerBusinessKey("1234567890", undefined, new Set(), "name:address")).toBe("1234567890");
    expect(buildCustomerBusinessKey("1234567890", "0002", new Set(), "name:address")).toBe("1234567890-0002");
    expect(buildCustomerBusinessKey("1234567890", "0002", new Set(["1234567890"]), "name:address")).toBe("name:address");
  });

  it("allows only distinct, non-empty sub-business numbers", () => {
    expect(hasSubBusinessNumberConflict("0002", ["0001", "0003"])).toBe(false);
    expect(hasSubBusinessNumberConflict("0002", ["0002"])).toBe(true);
    expect(hasSubBusinessNumberConflict("0002", [null])).toBe(true);
    expect(hasSubBusinessNumberConflict(undefined, ["0001"])).toBe(true);
  });
});
