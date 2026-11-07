import { describe, expect, it } from "vitest";
import { CUSTOMER_IMPORT_MAX_BYTES, getCustomerImportLimitMessage } from "../domains/customer/customer-import-limits";

describe("customer import request bounds", () => {
  it("rejects a declared body over 25MB", () => {
    expect(getCustomerImportLimitMessage({ contentLength: CUSTOMER_IMPORT_MAX_BYTES + 1, mappingCount: 0, rowCount: 1 })).toContain("25MB");
  });

  it("rejects more than 5,000 rows", () => {
    expect(getCustomerImportLimitMessage({ contentLength: 0, mappingCount: 0, rowCount: 5001 })).toContain("5,000행");
  });

  it("rejects more than 200 mappings", () => {
    expect(getCustomerImportLimitMessage({ contentLength: 0, mappingCount: 201, rowCount: 1 })).toContain("200개");
  });

  it("accepts the exact request bounds", () => {
    expect(getCustomerImportLimitMessage({ contentLength: CUSTOMER_IMPORT_MAX_BYTES, mappingCount: 200, rowCount: 5000 })).toBeNull();
  });
});
