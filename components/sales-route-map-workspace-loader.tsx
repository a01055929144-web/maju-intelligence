"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// 2026-08-31 성능 감사 대응(app/dashboard/page.tsx 지연 로드)으로 도입했으나, 그 파일이
// Server Component(async function, "use client" 없음)라 `next/dynamic`의 `ssr: false` 옵션을
// 직접 쓸 수 없었습니다(Next.js 빌드 에러: "`ssr: false` is not allowed with `next/dynamic` in
// Server Components"). 이 옵션은 Client Component 안에서만 허용되므로, 이 파일 하나를 별도
// Client Component로 분리해 dynamic()을 여기로 옮기고 서버 컴포넌트는 이 래퍼만 가져다 씁니다.
export const SalesRouteMapWorkspace = dynamic(
  () => import("@/components/sales-route-map-workspace").then((module) => module.SalesRouteMapWorkspace),
  {
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm font-bold text-slate-500">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        지도 홈을 불러오는 중입니다…
      </div>
    ),
    ssr: false
  }
);
