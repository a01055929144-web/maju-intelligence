"use client";

import { useState } from "react";

export type CalendarDayState = { ok: true } | { ok: false; reason: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (value: number) => String(value).padStart(2, "0");
const monthOf = (day: string) => day.slice(0, 7);
const shiftMonth = (month: string, delta: number) => {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
};

/**
 * 월 달력(7칸 표). 고를 수 있는 날과 못 고르는 날(회색 + 이유)을 `stateOf`가 정한다.
 * 배송일 선택과 고객사 휴무일 설정 화면이 함께 쓴다. 칸은 44px 이상, 날짜 계산은 문자열(YYYY-MM-DD)만 쓴다(시간대 영향 없음).
 */
export function DateCalendar({ value, today, stateOf, onChange, disabled = false, label = "날짜 선택" }: {
  value: string; today: string; stateOf: (day: string) => CalendarDayState; onChange: (day: string) => void; disabled?: boolean; label?: string;
}) {
  const [month, setMonth] = useState(monthOf(value || today));
  const first = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: Array<string | null> = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length }, (_, index) => `${month}-${pad(index + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return <section aria-label={label} className="space-y-2 rounded border p-2">
    <div className="flex items-center justify-between">
      <button aria-label="이전 달" className="min-h-11 min-w-11 rounded border" disabled={disabled} onClick={() => setMonth(shiftMonth(month, -1))} type="button">‹</button>
      <strong aria-live="polite">{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</strong>
      <button aria-label="다음 달" className="min-h-11 min-w-11 rounded border" disabled={disabled} onClick={() => setMonth(shiftMonth(month, 1))} type="button">›</button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-600" role="row">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
    <div className="grid grid-cols-7 gap-1" role="grid">
      {cells.map((day, index) => {
        if (!day) return <span key={`blank-${index}`} />;
        const state = stateOf(day), selected = day === value, number = Number(day.slice(8, 10));
        return <button aria-label={`${Number(day.slice(5, 7))}월 ${number}일${state.ok ? "" : ` ${state.reason}`}`} aria-pressed={selected} data-day={day} data-ok={state.ok}
          className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded border text-sm leading-tight ${selected ? "border-teal-700 bg-teal-700 font-bold text-white" : state.ok ? "bg-white font-semibold" : "bg-slate-100 text-slate-400"}`}
          disabled={disabled || !state.ok} key={day} onClick={() => onChange(day)} type="button">
          <span>{number}</span>
          {!state.ok && <span className="text-[10px] font-normal">{state.reason}</span>}
        </button>;
      })}
    </div>
  </section>;
}
