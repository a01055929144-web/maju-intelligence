import { describe, expect, it } from "vitest";
import { salesWorkspaceNavItems } from "../components/sales-workspace-nav-items";
import { isHoldModulePath } from "../lib/feature-modules";

describe("영업 관리 탭", () => {
  it("탭은 3개이고 보류 모듈 경로로 링크하지 않는다", () => {
    const items = salesWorkspaceNavItems({ active: "contacts", companyId: "00000000-0000-0000-0000-000000000001" });
    expect(items.map((item) => item.label)).toEqual(["컨택 기록", "보낸 문서·견적", "후속 대상"]);
    for (const item of items) expect(isHoldModulePath(new URL(item.href, "https://x.test").pathname)).toBe(false);
  });
  it("후속 대상 탭은 오늘·기한 지난 재연락 필터로 연다", () => {
    const followup = salesWorkspaceNavItems({ active: "followup" }).find((item) => item.label === "후속 대상");
    expect(followup?.href).toBe("/revenue/contacts?due=action");
    expect(followup?.active).toBe(true);
  });
});
