"use client";

import { Crosshair, Minus, Plus } from "lucide-react";

type MapCornerControlsProps = {
  readonly offsetClassName?: string;
  readonly onLocation: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
};

export function MapCornerControls({ offsetClassName = "right-3", onLocation, onZoomIn, onZoomOut }: MapCornerControlsProps) {
  const buttonClassName = "grid h-9 w-9 place-items-center bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
  return (
    <div aria-label="지도 조작" className={`absolute bottom-3 z-20 overflow-hidden rounded-lg border border-slate-200 shadow-lg ${offsetClassName}`}>
      <button aria-label="현재 위치" className={`${buttonClassName} border-b border-slate-200`} onClick={onLocation} title="현재 위치" type="button"><Crosshair aria-hidden="true" className="h-4 w-4" /></button>
      <button aria-label="지도 확대" className={`${buttonClassName} border-b border-slate-200`} onClick={onZoomIn} title="지도 확대" type="button"><Plus aria-hidden="true" className="h-4 w-4" /></button>
      <button aria-label="지도 축소" className={buttonClassName} onClick={onZoomOut} title="지도 축소" type="button"><Minus aria-hidden="true" className="h-4 w-4" /></button>
    </div>
  );
}
