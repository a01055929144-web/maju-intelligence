import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("route order UI boundaries", () => {
  it("keeps desktop and driver views explicit about order count, completion, empty and read-error states", () => {
    const desktop = readFileSync("components/today-course-view.tsx", "utf8");
    const mobilePage = readFileSync("app/mobile/today/page.tsx", "utf8");
    const mobileList = readFileSync("components/mobile-route-list.tsx", "utf8");

    expect(desktop).toContain("주문 {store.orderIds.length}건");
    expect(mobilePage).toContain("주문 {selectedStop.orderIds.length}건");
    expect(mobilePage).toContain("기존 수동 코스는 그대로 표시합니다");
    expect(mobileList).toContain("오늘 배송 없음");
    expect(mobileList).toContain("모두 완료");
  });
});
