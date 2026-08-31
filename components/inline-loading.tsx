import { Loader2 } from "lucide-react";

/**
 * 2026-08-31 UX 감사 대응: 화면마다 로딩 표시가 제각각이었습니다(텍스트만, Loader2 스피너,
 * RefreshCw+animate-spin 등). 특히 일부 화면은 "불러오는 중"과 "데이터 없음"이 똑같은
 * maju-empty-state 클래스 + 같은 문구 스타일을 써서 시각적으로 구분이 안 됐습니다
 * (예: 담당자 목록 패널에서 로딩 중과 담당자 0명이 완전히 같아 보임).
 *
 * 목록/패널 단위 로딩에 공통으로 쓰는 최소 컴포넌트입니다. 버튼 내부 로딩(아이콘을 Loader2로
 * 바꿔치기하는 패턴)이나 "새로고침" 같은 의미 있는 아이콘(RefreshCw)을 쓰는 액션 버튼은 이
 * 컴포넌트의 대상이 아닙니다 — 그건 다른 의미(진행 중인 동작)라 그대로 둡니다.
 */
export function InlineLoading({ className = "", label = "불러오는 중입니다..." }: { className?: string; label?: string }) {
  return (
    <p className={`maju-empty-state flex items-center justify-center gap-2 p-3 text-sm font-bold text-slate-400 ${className}`}>
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      {label}
    </p>
  );
}
