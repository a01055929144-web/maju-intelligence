import { describe, expect, it } from "vitest";
import { groupRowsByColumnSignature } from "../domains/organization/row-grouping";

describe("groupRowsByColumnSignature", () => {
  it("separates payloads so PostgREST receives uniform object keys", () => {
    const existing = { company_id: "company", normalized_key: "old", customer_name: "기존" };
    const created = { ...existing, normalized_key: "new", delivery_territory_id: "territory" };
    const groups = groupRowsByColumnSignature([existing, created]);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.every((row) => Object.keys(row).sort().join(",") === Object.keys(group[0]).sort().join(",")))).toBe(true);
  });

  it("separates conditional sales-analysis delivery distance keys", () => {
    expect(groupRowsByColumnSignature([{ normalized_key: "a" }, { normalized_key: "b", delivery_km: 12 }])).toHaveLength(2);
  });
});
