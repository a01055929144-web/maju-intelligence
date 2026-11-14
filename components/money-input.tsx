"use client";
import { useEffect, useRef, useState } from "react";
import { caretAfterFormat, formatMoneyInput, parseMoney } from "@/domains/shared/money";

// CC-41: 금액 입력칸 공용 부품. 입력 중에도 천 단위 쉼표(커서 유지), type="text" inputMode="numeric"(type="number"는 쉼표를 못 넣고 휠로 값이 바뀜).
// 값은 숫자로 전달: Enter·칸 밖 클릭 = onCommit(숫자|null), Esc = 원래 값으로 되돌림. 소수 없음(원 단위), 음수는 allowNegative일 때만.
export function MoneyInput({ value, onCommit, allowNegative = false, className = "", placeholder, disabled, ariaLabel, suffix }: {
  value: number | null; onCommit: (next: number | null) => void; allowNegative?: boolean; className?: string; placeholder?: string; disabled?: boolean; ariaLabel: string; suffix?: string;
}) {
  const original = value === null ? "" : formatMoneyInput(String(value), allowNegative);
  const [text, setText] = useState(original);
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const cancelled = useRef(false); // Esc 직후의 blur가 편집한 값을 확정하지 않게
  useEffect(() => { setText(original); }, [original]);
  useEffect(() => { if (caret.current !== null && ref.current) { ref.current.setSelectionRange(caret.current, caret.current); caret.current = null; } }, [text]);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const digitsBefore = raw.slice(0, event.target.selectionStart ?? raw.length).replace(/\D/g, "").length;
    const formatted = formatMoneyInput(raw, allowNegative);
    caret.current = caretAfterFormat(formatted, digitsBefore);
    setText(formatted);
  }
  function commit() {
    if (cancelled.current) { cancelled.current = false; return; }
    const next = text.trim() === "" ? null : parseMoney(text, allowNegative);
    if (next === value) { setText(original); return; }
    if (text.trim() !== "" && next === null) { setText(original); return; } // 해석할 수 없는 글은 되돌린다
    onCommit(next);
  }
  return <span className={`inline-flex items-center gap-1${className.includes("w-full") ? " w-full" : ""}`}>
    <input aria-label={ariaLabel} className={className} disabled={disabled} inputMode="numeric" onBlur={commit} onChange={onChange} placeholder={placeholder} ref={ref} type="text" value={text}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelled.current = true; setText(original); event.currentTarget.blur(); } }} />
    {suffix ? <span className="text-xs text-slate-500">{suffix}</span> : null}
  </span>;
}
