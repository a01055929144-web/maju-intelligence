"use client";

export function PrintPageButton() {
  return <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>인쇄 / PDF 저장</button>;
}
