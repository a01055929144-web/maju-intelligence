"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 2026-08-31 에러 처리/복원력 감사 대응: 리포지토리 전체에 Error Boundary가 하나도 없어서,
 * 어느 화면에서든 렌더링 중 예외가 하나만 나도(예: undefined 프로퍼티 접근) 그 라우트 전체가
 * 빈 화면으로 사라졌습니다. app/page.tsx, permit-leads-view.tsx, sales-route-map-workspace.tsx처럼
 * 매우 큰 컴포넌트에 로직이 몰려 있어 파급 범위가 특히 큽니다. Next.js App Router 규칙에 따라
 * 이 파일 하나로 app 디렉터리 전체(하위 라우트 포함)의 렌더링 에러를 잡아, 최소한 "화면이 깨졌고
 * 다시 시도할 수 있다"는 안내로 대체합니다.
 */
export default function GlobalErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled render error:", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center maju-app-bg px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-black text-slate-950">화면을 표시하는 중 오류가 발생했습니다</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          입력하신 데이터는 서버에 저장된 내용까지는 안전합니다. 다시 시도해도 같은 문제가 반복되면 새로고침하거나 잠시 후 다시 접속해주세요.
        </p>
        <Button className="mt-5 w-full" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          다시 시도
        </Button>
      </div>
    </main>
  );
}
