import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type ConversionState = {
  actionCustomerId?: string;
  linkedCustomerId?: string;
};

function reproduceCurrentCheckThenInsertRace(firstCustomerId: string, secondCustomerId: string) {
  const state: ConversionState = {};

  // 두 요청이 모두 기존 convert 이력이 없다고 읽은 뒤 각각 다른 고객을 선택한 상황이다.
  const firstSawAction = state.actionCustomerId;
  const secondSawAction = state.actionCustomerId;
  state.linkedCustomerId = firstCustomerId;
  state.linkedCustomerId = secondCustomerId;
  if (!firstSawAction) state.actionCustomerId = firstCustomerId;
  if (secondSawAction) state.actionCustomerId = secondSawAction;

  return state;
}

const atomicitySql = readFileSync("docs/sql-drafts/20261101-lead-customer-conversion-atomicity.sql", "utf8");

describe("lead conversion concurrency boundary", () => {
  it("reproduces the customer/action split when two conversions choose different customers", () => {
    expect(reproduceCurrentCheckThenInsertRace("customer-a", "customer-b")).toEqual({
      actionCustomerId: "customer-a",
      linkedCustomerId: "customer-b"
    });
  });

  it("keeps customer creation outside and atomically finalizes only the sales-owned link and action", () => {
    expect(atomicitySql).toContain("finalize_lead_customer_conversion_draft");
    expect(atomicitySql).toMatch(/for update/i);
    expect(atomicitySql).toMatch(/customer\.company_id = p_company_id/i);
    expect(atomicitySql).toContain("lead_customer_conversion_customer_mismatch");
    expect(atomicitySql).toMatch(/unique index[\s\S]*\(company_id, lead_id\)[\s\S]*action_type = 'convert'/i);
    expect(atomicitySql).not.toMatch(/insert into public\.normalized_customers/i);
    expect(atomicitySql).not.toMatch(/update public\.normalized_customers/i);
  });
});
