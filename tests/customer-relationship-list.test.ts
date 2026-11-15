import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isStoreVisibleByStatus, relationshipLabel } from "../domains/customer/relationship-filter";

describe("customer relationship list", () => {
  const active = { relationshipStatus: "거래중" };
  const terminated = { relationshipStatus: "거래종료" };

  it("hides terminated customers by default and shows them on request", () => {
    const hidden = { excludeClosed: false, showTerminated: false };
    const visible = { excludeClosed: false, showTerminated: true };
    expect([active, terminated].filter((customer) => isStoreVisibleByStatus(customer, hidden))).toEqual([active]);
    expect([active, terminated].filter((customer) => isStoreVisibleByStatus(customer, visible))).toEqual([active, terminated]);
    expect(relationshipLabel(terminated.relationshipStatus)).toBe("거래 종료");
  });

  it("wires the shared rule, toggle and gray chip into the customer list", () => {
    const source = readFileSync("app/crm/timeline/page.tsx", "utf8");
    expect(source).toContain("isStoreVisibleByStatus(customer");
    expect(source).toContain("거래 종료 거래처 보기");
    expect(source).toContain("relationshipLabel(customer.relationshipStatus)");
    expect(source).toContain("bg-slate-200 text-slate-700");
    expect(source).toContain('<SearchInput aria-label="거래처 검색"');
    expect(source).toContain("const { confirm, confirmDialog } = useConfirm()");
    expect(source).toContain('<LoadingState className="m-4"');
    expect(source).not.toContain("window.confirm(");
  });
});
