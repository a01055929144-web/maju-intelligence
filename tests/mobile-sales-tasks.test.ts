import { describe, expect, it } from "vitest";
import { flushMobileSalesActionQueue, readMobileSalesActionQueue, writeMobileSalesActionQueue } from "../application/mobile-sales/action-queue";
import { buildMobileSalesTaskGroups } from "../application/mobile-sales/today-tasks";
import type { PermitLeadItem } from "../lib/store";

function lead(id: string, patch: Partial<PermitLeadItem> = {}): PermitLeadItem {
  return {
    id,
    businessName: id,
    isActive: true,
    leadPeriod: "recent",
    industryPrimary: "한식",
    industryTags: [],
    isTargetIndustry: true,
    isTemporaryOperation: false,
    isTemporaryOperationSuspected: false,
    isDuplicate: false,
    status: "신규 수집",
    nextActionReasons: [],
    scoreTotal: 50,
    scoreBreakdown: {},
    grade: null,
    createdAt: "2026-10-25T00:00:00Z",
    updatedAt: "2026-10-25T00:00:00Z",
    ...patch
  };
}

describe("mobile sales today tasks", () => {
  it("splits follow-up, 010 SMS, DM and visit work without duplicating cards", () => {
    const groups = buildMobileSalesTaskGroups([
      lead("follow", { status: "재연락 예정", phone: "010-1111-2222" }),
      lead("sms", { phone: "010-3333-4444" }),
      lead("dm", { instagramUrl: "https://instagram.com/store" }),
      lead("visit", { address: "서울 강남구", scoreTotal: 90 })
    ]);
    expect(groups.map((group) => [group.kind, group.count])).toEqual([
      ["follow_up", 1], ["sms", 1], ["dm", 1], ["visit", 1]
    ]);
  });
});

describe("mobile sales offline queue", () => {
  it("keeps only actions that still fail during retry", async () => {
    const items = [
      { createdAt: "2026-10-25", id: "1", leadId: "a", payload: {} },
      { createdAt: "2026-10-25", id: "2", leadId: "b", payload: {} }
    ];
    expect(await flushMobileSalesActionQueue(items, async (item) => item.id === "1")).toEqual([items[1]]);
  });

  it("round-trips queue storage and tolerates malformed data", () => {
    let value = "not-json";
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    expect(readMobileSalesActionQueue(storage)).toEqual([]);
    const items = [{ createdAt: "2026-10-25", id: "1", leadId: "a", payload: {} }];
    writeMobileSalesActionQueue(storage, items);
    expect(readMobileSalesActionQueue(storage)).toEqual(items);
  });
});

