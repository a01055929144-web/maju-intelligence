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
      <div aria-busy="true" aria-live="polite" className="maju-section-card flex min-h-[620px] flex-col overflow-hidden text-slate-900 xl:min-h-[760px]" role="status">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-700" />
            <div>
              <p className="text-sm font-black text-slate-900">지도 홈을 준비하고 있습니다</p>
              <p className="text-[11px] font-bold text-slate-500">거래처 좌표와 배송차 현황을 화면에 연결하는 중입니다.</p>
            </div>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black text-teal-800 ring-1 ring-inset ring-teal-100">작업 진행 중</span>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 bg-slate-100 p-3 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <div className="hidden animate-pulse rounded-xl border border-slate-200 bg-white xl:block" />
          <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(135deg,#e8f3ef_0%,#e8f3ef_38%,#f8fafc_38%,#f8fafc_56%,#e8eef8_56%,#e8eef8_100%)] xl:min-h-0">
            <div className="absolute left-4 top-4 h-10 w-[min(420px,calc(100%-32px))] animate-pulse rounded-lg bg-white/90 shadow-sm" />
            <div className="absolute inset-0 grid place-items-center">
              <span className="rounded-full bg-white/90 px-4 py-2 text-xs font-black text-slate-600 shadow-sm">지도 모듈 불러오는 중</span>
            </div>
          </div>
          <div className="hidden animate-pulse rounded-xl border border-slate-200 bg-white xl:block" />
        </div>
      </div>
    ),
    ssr: false
  }
);
