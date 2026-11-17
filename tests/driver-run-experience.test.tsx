import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DriverItemIssueEditor, MobileDriverRunExtras } from "../components/mobile-driver-run-extras";
import { canUndoDriverAction, DRIVER_UNDO_WINDOW_MS } from "../domains/delivery/undo-window";

describe("CX-65 driver run experience", () => {
  it("keeps the exact five-second undo boundary", () => {
    expect(canUndoDriverAction(1_000, 999)).toBe(false);
    expect(canUndoDriverAction(1_000, 1_000 + DRIVER_UNDO_WINDOW_MS)).toBe(true);
    expect(canUndoDriverAction(1_000, 1_000 + DRIVER_UNDO_WINDOW_MS + 1)).toBe(false);
  });

  it("offers the four item states without money controls", () => {
    const html = renderToStaticMarkup(<DriverItemIssueEditor />);
    for (const label of ["정상", "파손", "누락", "오배송"]) expect(html).toContain(label);
    expect(html).toContain("완료 사진 촬영에서 선택");
    expect(html).toContain("금액이나 전표를 바꾸지 않습니다");
    expect(html).not.toContain("차감 금액");
  });

  it("shows wake-lock guidance and today's four totals", () => {
    const html = renderToStaticMarkup(<MobileDriverRunExtras completed={4} failed={1} photos={3} sales={2} />);
    expect(html).toContain("화면 꺼짐 방지를 다시 시도합니다");
    for (const label of ["완료", "전달 못 함", "영업", "사진"]) expect(html).toContain(label);
  });
});
