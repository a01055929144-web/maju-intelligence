"use client";

import { useEffect, useRef } from "react";
import { AppStateScreen } from "@/components/app-state-screen";

/**
 * 2026-08-31 에러 처리/복원력 감사 대응: 리포지토리 전체에 Error Boundary가 하나도 없어서,
 * 어느 화면에서든 렌더링 중 예외가 하나만 나도(예: undefined 프로퍼티 접근) 그 라우트 전체가
 * 빈 화면으로 사라졌습니다. app/page.tsx, permit-leads-view.tsx, sales-route-map-workspace.tsx처럼
 * 매우 큰 컴포넌트에 로직이 몰려 있어 파급 범위가 특히 큽니다. Next.js App Router 규칙에 따라
 * 이 파일 하나로 app 디렉터리 전체(하위 라우트 포함)의 렌더링 에러를 잡아, 최소한 "화면이 깨졌고
 * 다시 시도할 수 있다"는 안내로 대체합니다.
 */
export default function GlobalErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error("Unhandled render error:", error);
    headingRef.current?.focus();
  }, [error]);

  return (
    <AppStateScreen
      description="서버에 저장된 내용은 유지됩니다. 다시 시도해도 같은 문제가 반복되면 잠시 후 다시 접속해주세요."
      heading="화면을 표시하는 중 오류가 발생했습니다"
      headingRef={headingRef}
      onRetry={reset}
      tone="error"
    />
  );
}
