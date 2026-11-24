import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLeadContactActionType, LEAD_CONTACT_ACTION_TYPES } from "../domains/lead/contact-channels";
import { LEAD_ACTION_TYPE_LABELS } from "../domains/lead/action-labels";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/store/00-core", () => ({ isProductionStoreConfigured: () => true, supabaseRequest: mocks.request }));
vi.mock("../lib/store", () => ({ getCompanyStaffInvitations: vi.fn(), isMissingSalesQuoteSchemaError: () => false }));

import { getSalesKpiSnapshot } from "../lib/store/09-sales-kpi";

describe("CX-135 field_visit 리드 기록", () => {
  beforeEach(() => { mocks.request.mockReset(); });

  it("field_visit은 영업 성과 연락 종류에 없고 타임라인에는 '현장 기록'으로 보인다", () => {
    expect(LEAD_CONTACT_ACTION_TYPES as readonly string[]).not.toContain("field_visit");
    expect(isLeadContactActionType("field_visit")).toBe(false);
    expect(isLeadContactActionType("visit")).toBe(true);
    expect(LEAD_ACTION_TYPE_LABELS.field_visit).toBe("현장 기록");
    expect(LEAD_ACTION_TYPE_LABELS.visit).toBe("방문");
  });

  it("영업 성과 집계(연락·견적·전환)에서 field_visit은 빠진다", async () => {
    mocks.request.mockImplementation(async (path: string) => {
      if (path.startsWith("sales_kpi_targets")) return [];
      if (path.startsWith("lead_actions")) return [
        { action_type: "visit", result: null }, { action_type: "call", result: null }, { action_type: "quote", result: null },
        { action_type: "field_visit", result: "현장 기록" }, { action_type: "field_visit", result: "현장 기록" }, { action_type: "field_visit", result: "현장 기록(사진 없음 · 방문 인정 안 됨)" }
      ];
      return [];
    });
    const snapshot = await getSalesKpiSnapshot("company-1");
    expect(snapshot.actualContacts).toBe(3); // visit + call + quote. field_visit 3건은 세지 않음.
    expect(snapshot.actualQuotes).toBe(1);
    expect(snapshot.actualConversions).toBe(0);
  });
});
