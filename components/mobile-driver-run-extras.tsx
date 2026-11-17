"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, MoonStar } from "lucide-react";

type WakeLockSentinelLike = { release(): Promise<void>; addEventListener(type: "release", listener: () => void): void };

export function MobileDriverRunExtras({ completed, failed, sales, photos }: { completed: number; failed: number; sales: number; photos: number }) {
  const [wakeState, setWakeState] = useState<"active" | "idle" | "unsupported">("idle");

  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
      if (!wakeLock) { setWakeState("unsupported"); return; }
      try {
        sentinel = await wakeLock.request("screen");
        if (cancelled) { await sentinel.release(); return; }
        setWakeState("active");
        sentinel.addEventListener("release", () => setWakeState("idle"));
      } catch { setWakeState("idle"); }
    };
    const onVisibility = () => { if (document.visibilityState === "visible" && !sentinel) void request(); };
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibility); void sentinel?.release(); };
  }, []);

  return <div className="space-y-2" data-testid="driver-run-extras">
    <p className="mobile-muted flex items-center gap-1.5 text-[11px] font-bold">
      <MoonStar className="h-3.5 w-3.5" />
      {wakeState === "active" ? "운행 중 화면 꺼짐 방지 켜짐" : wakeState === "unsupported" ? "이 기기는 화면 꺼짐 방지를 지원하지 않습니다." : "화면 꺼짐 방지를 다시 시도합니다."}
    </p>
    <details className="mobile-card-raised rounded-xl border">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-black">운행 종료 · 오늘 요약</summary>
      <div className="grid grid-cols-4 gap-2 border-t border-[var(--mobile-border)] p-3 text-center text-xs">
        <Summary value={completed} label="완료" /><Summary value={failed} label="전달 못 함" /><Summary value={sales} label="영업" /><Summary value={photos} label="사진" />
      </div>
    </details>
  </div>;
}

function Summary({ value, label }: { value: number; label: string }) {
  return <div><p className="text-lg font-black">{value}</p><p className="mobile-muted font-bold">{label}</p></div>;
}

export type DriverItemIssue = { item: string; status: "normal" | "damaged" | "missing" | "wrong"; memo: string };
const choices = [["normal", "정상"], ["damaged", "파손"], ["missing", "누락"], ["wrong", "오배송"]] as const;

export function DriverItemIssueEditor({ onChange }: { onChange?: (value: DriverItemIssue) => void }) {
  const [value, setValue] = useState<DriverItemIssue>({ item: "", status: "normal", memo: "" });
  const update = (next: DriverItemIssue) => { setValue(next); onChange?.(next); };
  return <details className="mobile-card-raised mt-3 rounded-xl border">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs font-black"><AlertTriangle className="h-4 w-4" />문제 품목 기록 (선택)</summary>
    <div className="border-t border-[var(--mobile-border)] p-3">
      <input aria-label="문제 품목명" className="mobile-input min-h-11 w-full rounded-lg border px-3 text-sm" onChange={(event) => update({ ...value, item: event.target.value })} placeholder="품목명" value={value.item} />
      <div aria-label="품목 상태" className="mt-2 grid grid-cols-4 gap-1.5">{choices.map(([status, label]) => <button aria-pressed={value.status === status} className={`min-h-11 rounded-lg border text-xs font-black ${value.status === status ? "mobile-primary-action" : "mobile-secondary-action"}`} key={status} onClick={() => update({ ...value, status })} type="button">{label}</button>)}</div>
      <p className="mobile-muted mt-2 rounded-lg border px-3 py-2 text-xs font-bold">사진은 위의 완료 사진 촬영에서 선택할 수 있습니다.</p>
      <textarea aria-label="문제 품목 메모" className="mobile-input mt-2 min-h-20 w-full rounded-lg border p-3 text-sm" onChange={(event) => update({ ...value, memo: event.target.value })} placeholder="메모 (선택)" value={value.memo} />
      <p className="mt-2 text-[11px] font-bold text-amber-700">이 기록은 금액이나 전표를 바꾸지 않습니다.</p>
    </div>
  </details>;
}
