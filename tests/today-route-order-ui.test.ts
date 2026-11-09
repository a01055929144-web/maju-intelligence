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

  it("connects the driver completion button to the guarded order completion API", () => {
    const mobilePage = readFileSync("app/mobile/today/page.tsx", "utf8");
    const proofPanel = readFileSync("components/mobile-delivery-proof-panel.tsx", "utf8");

    expect(mobilePage).toContain('orderCompletionEnabled={isFeatureEnabled("STAGE_D_ORDER_COMPLETION", session.companyId)}');
    expect(mobilePage).toContain("orderIds={selectedStop.orderIds || []}");
    expect(mobilePage).toContain("orderRevisions={selectedStop.orderRevisions || {}}");
    expect(proofPanel).toContain('fetchWithTimeout("/api/routes/delivery-completions"');
    expect(proofPanel).toContain('orderCompletionEnabled && deliveryStatus === "arrived"');
    expect(proofPanel).toContain("completionEventId: progress.completionEventId");
    expect(proofPanel).toContain("idempotencyKey: progress.completionEventId");
    expect(proofPanel).toContain("completedAt: progress.completedAt");
    expect(proofPanel).toContain("같은 버튼을 다시 누르면 저장된 사진과 메모는 재사용합니다");
    expect(proofPanel).toContain("router.refresh()");
  });
});
