import { describe, expect, it } from "vitest";

import { customerNavigationGroups, flattenCustomerNavigationItems, getCustomerNavigationGroups, holdNavigationGroups } from "../lib/customer-navigation";

describe("customer navigation", () => {
  it("keeps today separate above the core groups", () => {
    expect(customerNavigationGroups.map((group) => group.label)).toEqual(["오늘", "영업", "동선", "설정"]);
    expect(customerNavigationGroups[0].items.map((item) => item.label)).toEqual(["홈"]);
  });

  it("keeps the focused sales and logistics destinations reachable", () => {
    const flattened = flattenCustomerNavigationItems();

    expect(flattened.map((item) => item.href)).toEqual(expect.arrayContaining([
      "/dashboard",
      "/leads?type=permit", "/leads?type=keyword", "/revenue/contacts",
      "/map", "/routes/today", "/map?view=history", "/dashboard/settings/routes",
      "/dashboard/settings/company", "/dashboard/settings/staff", "/settings/billing"
    ]));
    expect(flattened.map((item) => item.label)).toEqual(expect.arrayContaining(["영업 관리", "배송 이력"]));
    expect(customerNavigationGroups.find((group) => group.label === "설정")?.items.map((item) => item.label)).toContain("데이터 가져오기");
    expect(flattened.map((item) => item.label)).toEqual(expect.arrayContaining(["새로 가져오기", "업로드 이력"]));
    expect(flattened.map((item) => item.label)).not.toContain("연락 기록");
  });

  it("exposes held destinations only through the explicit module switch", () => {
    const focused = getCustomerNavigationGroups(false);
    expect(focused.map((group) => group.label)).toEqual(["오늘", "영업", "동선", "ERP", "설정"]);
    expect(focused.find((group) => group.label === "ERP")?.items).toHaveLength(3);
    const expanded = getCustomerNavigationGroups(true);
    expect(expanded.map((group) => group.label)).toEqual(["오늘", "영업", "동선", "ERP", "설정"]);
    expect(flattenCustomerNavigationItems(expanded)).toEqual(expect.arrayContaining(flattenCustomerNavigationItems(holdNavigationGroups)));
    expect(expanded.find((group) => group.label === "ERP")?.items.slice(0, 3).map((item) => item.label)).toEqual(["상품관리", "매출처", "매입처"]);
  });

  it("shows only approved pricing links without opening other held modules", () => {
    const pricing = getCustomerNavigationGroups(false, "owner", true, false);
    const hrefs = flattenCustomerNavigationItems(pricing).map((item) => item.href);
    expect(hrefs).toContain("/revenue/pricing/documents");
    expect(hrefs).toContain("/revenue/pricing");
    expect(hrefs).toContain("/revenue/products");
    expect(hrefs).not.toContain("/revenue/pricing/links");
    expect(hrefs).not.toContain("/crm/summary");
    const enabled = getCustomerNavigationGroups(false, "owner", true, true);
    expect(enabled.map((group) => group.label)).toEqual(["오늘", "영업", "주문", "단가", "동선", "ERP", "설정"]);
    expect(flattenCustomerNavigationItems(enabled).map((item) => item.href)).toEqual(expect.arrayContaining(["/revenue/pricing/links", "/revenue/pricing/order-settings"]));
    expect(enabled.find((group) => group.label === "ERP")?.items[0].label).toBe("상품관리");
    expect(getCustomerNavigationGroups(false, "driver", true, true).map((group) => group.label)).not.toContain("주문");
    expect(getCustomerNavigationGroups(false, "driver", true, true).map((group) => group.label)).not.toContain("단가");
  });

  it("keeps the three core ERP directories visible without the hold switch", () => {
    const erp = getCustomerNavigationGroups(false, "owner", false, false).find((group) => group.label === "ERP");
    expect(erp?.items.map((item) => item.href)).toEqual(["/revenue/products", "/crm/timeline", "/purchasing/suppliers"]);
  });

  it("moves performance into the home tabs instead of a separate sales menu", () => {
    const labelsFor = (role: string) => flattenCustomerNavigationItems(getCustomerNavigationGroups(false, role)).map((item) => item.label);

    for (const role of ["owner", "manager", "sales", "driver"]) expect(labelsFor(role)).not.toContain("성과");
    expect(labelsFor("owner")).toContain("홈");
  });

  it("does not duplicate an exact navigation destination", () => {
    const identities = flattenCustomerNavigationItems().map((item) => `${item.active}:${item.href}`);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("does not expose the future group messaging placeholder", () => {
    expect(flattenCustomerNavigationItems().map((item) => item.label)).not.toContain("단체메시지");
  });
});
