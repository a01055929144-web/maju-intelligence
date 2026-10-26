import { describe, expect, it } from "vitest";
import { exposeManagedCompanyCredentialState } from "../application/admin/managed-company-credentials";

describe("managed company credential exposure", () => {
  it("returns password presence without returning the stored hash", () => {
    const exposed = exposeManagedCompanyCredentialState("owner@example.com", "scrypt$salt$secret-hash");

    expect(exposed).toEqual({ customerEmail: "owner@example.com", hasPassword: true });
    expect(JSON.stringify(exposed)).not.toContain("scrypt$");
    expect(exposed).not.toHaveProperty("customerPassword");
  });
});
