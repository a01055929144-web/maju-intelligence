import { describe, expect, it } from "vitest";
import { getMapLeadReminderLabel, runMapLeadStageBulk } from "../lib/map-lead-workflow";

const now = new Date("2026-10-27T00:00:00+09:00");

describe("map lead reminders", () => {
  it("prioritizes an overdue scheduled follow-up", () => {
    expect(getMapLeadReminderLabel({ followUpAt: "2026-10-26T09:00:00+09:00", status: "재연락 예정" }, now)).toBe("재연락 예정일이 지났습니다");
  });

  it("reminds after five days for contact and quote stages", () => {
    expect(getMapLeadReminderLabel({ lastContactAt: "2026-10-20T00:00:00+09:00", status: "연락 완료" }, now)).toContain("연락 후 7일");
    expect(getMapLeadReminderLabel({ lastContactAt: "2026-10-20T00:00:00+09:00", status: "견적 발송" }, now)).toContain("견적 전달 후 7일");
  });

  it("does not warn before the default five-day threshold", () => {
    expect(getMapLeadReminderLabel({ lastContactAt: "2026-10-24T00:00:00+09:00", status: "연락 완료" }, now)).toBe("");
  });
});

describe("map lead bulk stage changes", () => {
  it("limits concurrency and reports each lead result", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await runMapLeadStageBulk(["1", "2", "3", "4", "5", "6"], async (leadId) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { ok: leadId !== "5" };
    }, 4);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(results.filter((result) => !result.ok).map((result) => result.leadId)).toEqual(["5"]);
  });
});
