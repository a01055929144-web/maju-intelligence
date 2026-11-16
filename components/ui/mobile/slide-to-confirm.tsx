"use client";

import { useRef, useState, type PointerEvent } from "react";

/** 손잡이를 끝 쪽(기본 85% 이상)까지 밀면 처리된다. */
export const SLIDE_COMPLETE_RATIO = 0.85;
export const isSlideComplete = (offset: number, max: number, ratio = SLIDE_COMPLETE_RATIO) => max > 0 && offset / max >= ratio;
export const clampSlide = (offset: number, max: number) => Math.max(0, Math.min(max, offset));

const HANDLE = 48;

type Props = { readonly label: string; readonly onConfirm: () => void; readonly disabled?: boolean; readonly busy?: boolean };

/** 밀어서 처리(D-3 0절 ②): 잘못 누름 방지. 같은 동작을 하는 일반 버튼을 함께 둔다(키보드·화면 읽기 프로그램 — 포커스를 받으면 보인다). */
export function SlideToConfirm({ busy = false, disabled = false, label, onConfirm }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const off = disabled || busy;
  const max = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - HANDLE - 8);

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (off) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startX.current = event.clientX - offset;
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startX.current !== null) setOffset(clampSlide(event.clientX - startX.current, max()));
  };
  const onUp = () => {
    if (startX.current === null) return;
    startX.current = null;
    if (isSlideComplete(offset, max())) onConfirm();
    setOffset(0);
  };

  return (
    <div>
      <div aria-hidden="true" className={`relative h-14 select-none overflow-hidden rounded-full bg-slate-200 ${off ? "opacity-50" : ""}`} ref={trackRef}>
        <span className="absolute inset-0 grid place-items-center text-[15px] font-bold text-slate-600">{busy ? "처리 중…" : `${label} →`}</span>
        <div className="absolute left-1 top-1 grid h-12 w-12 touch-none place-items-center rounded-full bg-teal-700 text-white shadow" onPointerCancel={onUp} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ transform: `translateX(${offset}px)` }}>›</div>
      </div>
      <button className="sr-only focus:not-sr-only focus:mt-2 focus:h-12 focus:w-full focus:rounded-lg focus:bg-teal-700 focus:text-[16px] focus:font-bold focus:text-white" disabled={off} onClick={onConfirm} type="button">{label}</button>
    </div>
  );
}
