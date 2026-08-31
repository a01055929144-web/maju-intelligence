"use client";

import { useEffect } from "react";

// 2026-08-31 에러 처리/복원력 감사 후속: 저장 버튼을 누르기 전까지는 서버에 반영되지 않는 긴 입력
// 폼에서, 실수로 새로고침하거나 다른 페이지로 이동하면 입력한 내용이 그대로 사라집니다. isDirty가
// true인 동안에는 브라우저 기본 "변경사항이 저장되지 않았습니다" 확인창을 띄워 실수로 나가는 것을
// 막습니다. 브라우저 정책상 커스텀 문구는 표시되지 않고(각 브라우저가 자체 문구를 씁니다), 같은 탭
// 안에서의 클라이언트 사이드 이동(Next.js router.push 등)에는 적용되지 않습니다 — beforeunload는
// 탭 닫기/새로고침/주소창 이동 같은 실제 페이지 이탈에만 반응합니다.
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
