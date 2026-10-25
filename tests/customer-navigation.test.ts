import { describe, expect, it } from "vitest";

import { customerNavigationGroups, flattenCustomerNavigationItems, getCustomerNavigationGroups, holdNavigationGroups } from "../lib/customer-navigation";

describe("customer navigation", () => {
  it("shows only the three focused groups by default", () => {
    expect(customerNavigationGroups.map((group) => group.label)).toEqual(["영업", "동선", "설정"]);
  });

  it("keeps the focused sales and logistics destinations reachable", () => {
    const flattened = flattenCustomerNavigationItems();

    expect(flattened.map((item) => item.href)).toEqual(expect.arrayContaining([
      "/leads?type=permit", "/leads?type=keyword", "/revenue/contacts",
      "/map", "/routes/today", "/map?view=history", "/dashboard/settings/routes",
      "/dashboard/settings/company", "/dashboard/settings/staff"
    ]));
  });

  it("exposes held destinations only through the explicit module switch", () => {
    expect(getCustomerNavigationGroups(false)).toEqual(customerNavigationGroups);
    expect(getCustomerNavigationGroups(true)).toEqual([...customerNavigationGroups, ...holdNavigationGroups]);
  });

  it("does not duplicate an exact navigation destination", () => {
    const identities = flattenCustomerNavigationItems().map((item) => `${item.active}:${item.href}`);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("does not expose the future group messaging placeholder", () => {
    expect(flattenCustomerNavigationItems().map((item) => item.label)).not.toContain("단체메시지");
  });
});
