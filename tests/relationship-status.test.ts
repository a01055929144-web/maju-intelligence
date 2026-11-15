import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTerminatedHiddenOnMap, relationshipLabel, TERMINATED_HIDDEN_NOTICE } from "../domains/customer/relationship-filter";
import { relationshipChipClass } from "../components/map/map-row-helpers";

describe("거래 상태 표시 (48-1)", () => {
  it("relationshipLabel: 거래 종료는 띄어 쓴 고정 문구, 그 밖은 원문, 없으면 fallback", () => {
    expect(relationshipLabel("거래종료")).toBe("거래 종료");
    expect(relationshipLabel("거래중")).toBe("거래중");
    expect(relationshipLabel("관리중")).toBe("관리중");
    expect(relationshipLabel(undefined)).toBe("거래중");
    expect(relationshipLabel(null, "거래처")).toBe("거래처");
  });

  it("칩 모양: 거래 종료 = 회색, 그 밖 = 초록", () => {
    expect(relationshipChipClass("거래종료")).toContain("bg-slate-200");
    expect(relationshipChipClass("거래중")).toContain("bg-emerald-50");
    expect(relationshipChipClass(undefined)).toContain("bg-emerald-50");
  });

  it("isTerminatedHiddenOnMap: 거래 종료이고 지금 안 보일 때만(보기 켜면 아님, 폐업만으로는 아님)", () => {
    const off = { excludeClosed: false, showTerminated: false };
    expect(isTerminatedHiddenOnMap({ relationshipStatus: "거래종료" }, off)).toBe(true);
    expect(isTerminatedHiddenOnMap({ relationshipStatus: "거래종료" }, { excludeClosed: false, showTerminated: true })).toBe(false);
    // 이탈 제외가 켜져 있으면 거래 종료 보기를 켜도 가려진다 → 안내가 계속 나와야 "지도에 보기"(이탈 제외도 끔)가 의미 있다.
    expect(isTerminatedHiddenOnMap({ relationshipStatus: "거래종료" }, { excludeClosed: true, showTerminated: true })).toBe(true);
    expect(isTerminatedHiddenOnMap({ relationshipStatus: "거래중" }, off)).toBe(false);
    expect(isTerminatedHiddenOnMap({ relationshipStatus: "거래중", businessStatus: "closed" }, { excludeClosed: true, showTerminated: false })).toBe(false);
    expect(TERMINATED_HIDDEN_NOTICE).toContain("거래 종료 거래처");
  });

  it("상세 머리: 지금 상태 칩 + 버튼은 행동만, 종료·재개 모두 확인 창(window.confirm 없음)", () => {
    const detail = readFileSync("components/map/map-place-detail.tsx", "utf8");
    expect(detail).toContain("relationshipLabel(draftRelationshipStatus)");
    expect(detail).toContain('"거래 재개" : "거래 종료"');
    expect(detail).not.toContain("로 표시\"}");
    expect(detail).not.toContain("window.confirm(`${draftName}");
    expect(detail).toContain("지도·목록 기본 보기에서 숨겨집니다");
    expect(detail).toContain('title: "거래 재개"');
  });
});
