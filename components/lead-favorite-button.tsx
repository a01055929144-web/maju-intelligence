"use client";

import { Loader2, Star } from "lucide-react";

export function LeadFavoriteButton({ busy, leadName, onToggle, starred }: {
  busy: boolean;
  leadName: string;
  onToggle: () => void;
  starred: boolean;
}) {
  return (
    <button
      aria-label={`${leadName} ${starred ? "즐겨찾기 해제" : "즐겨찾기"}`}
      aria-pressed={starred}
      className={`grid h-[44px] min-h-[44px] w-[44px] min-w-[44px] shrink-0 place-items-center rounded-md border transition disabled:opacity-50 ${starred ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600"}`}
      disabled={busy}
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      title={starred ? "즐겨찾기 해제" : "회사 즐겨찾기에 추가"}
      type="button"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={`h-4 w-4 ${starred ? "fill-current" : ""}`} />}
    </button>
  );
}

export function LeadFavoriteFilter({ active, count, error, onChange, onRetry, status }: {
  active: boolean;
  count: number;
  error: string;
  onChange: () => void;
  onRetry: () => void;
  status: "disabled" | "error" | "forbidden" | "loading" | "ready";
}) {
  if (status === "disabled") return null;
  if (status === "forbidden") return <span className="text-xs font-bold text-slate-400" role="status">즐겨찾기 권한 없음</span>;
  if (status === "error") return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-rose-700" role="alert">
      {error || "즐겨찾기를 불러오지 못했습니다."}
      <button className="min-h-[44px] rounded-md border border-rose-200 bg-white px-2" onClick={onRetry} type="button">다시 시도</button>
    </span>
  );
  return (
    <button
      aria-pressed={active}
      className={`min-h-[44px] rounded-md border px-3 text-xs font-black transition disabled:opacity-50 ${active ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:bg-amber-50"}`}
      disabled={status === "loading"}
      onClick={onChange}
      type="button"
    >
      {status === "loading" ? "★ 불러오는 중" : `★만 ${count.toLocaleString()}`}
    </button>
  );
}
