"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** mobileOnly: 휴대폰(≤640px)에서만 보이는 항목(PC에서는 툴바에 따로 버튼이 있다). */
export type DropdownItem = { label: string; onSelect: () => void; disabled?: boolean; mobileOnly?: boolean };

/** "더보기 ▾" 같은 메뉴 버튼. Enter·Space·↓로 열고 ↑↓·Home·End로 이동, Enter로 고르기, Esc·바깥 클릭으로 닫기. */
export function DropdownMenu({ items, label = "더보기" }: { items: DropdownItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function focusItem(index: number) {
    const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
    if (!enabled.length) return;
    const next = index < 0 ? enabled[enabled.length - 1] : index >= items.length ? enabled[0] : enabled.includes(index) ? index : enabled.find((i) => i > index) ?? enabled[0];
    itemRefs.current[next]?.focus();
  }

  function onTriggerKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault(); setOpen(true);
    setTimeout(() => focusItem(0), 0);
  }

  function onItemKey(event: React.KeyboardEvent, index: number) {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); root.current?.querySelector("button")?.focus(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); focusItem(index + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusItem(index - 1 < 0 ? -1 : index - 1); }
    else if (event.key === "Home") { event.preventDefault(); focusItem(0); }
    else if (event.key === "End") { event.preventDefault(); focusItem(-1); }
  }

  return (
    <div className="relative" ref={root}>
      <Button aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)} onKeyDown={onTriggerKey} type="button" variant="outline">
        {label}<ChevronDown className="h-4 w-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" role="menu">
          {items.map((item, index) => (
            <button
              className={`block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none disabled:opacity-40 ${item.mobileOnly ? "sm:hidden" : ""}`}
              disabled={item.disabled}
              key={item.label}
              onClick={() => { setOpen(false); item.onSelect(); }}
              onKeyDown={(event) => onItemKey(event, index)}
              ref={(node) => { itemRefs.current[index] = node; }}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
