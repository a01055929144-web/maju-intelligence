"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: string; disabled?: boolean };

/** 공용 탭: 밑줄형 기본, 칩형(variant="chip") 옵션. ←→·Home·End 키로 이동. 선택 상태는 부모가 가진다(URL 쿼리 연결도 부모에서). */
export function Tabs({
  ariaLabel,
  className,
  items,
  onChange,
  value,
  variant = "underline",
}: {
  ariaLabel: string;
  className?: string;
  items: TabItem[];
  onChange: (id: string) => void;
  value: string;
  variant?: "underline" | "chip";
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = items.filter((item) => !item.disabled);

  function onKeyDown(event: React.KeyboardEvent, id: string) {
    const index = enabled.findIndex((item) => item.id === id);
    const target = event.key === "ArrowRight" ? enabled[(index + 1) % enabled.length]
      : event.key === "ArrowLeft" ? enabled[(index - 1 + enabled.length) % enabled.length]
      : event.key === "Home" ? enabled[0]
      : event.key === "End" ? enabled[enabled.length - 1]
      : null;
    if (!target) return;
    event.preventDefault();
    onChange(target.id);
    refs.current[target.id]?.focus();
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn("flex gap-1 overflow-x-auto", variant === "underline" ? "border-b border-slate-200" : "flex-wrap", className)}
      role="tablist"
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            aria-selected={selected}
            className={cn(
              "shrink-0 text-sm font-bold disabled:opacity-40",
              variant === "underline"
                ? cn("h-10 border-b-2 px-3", selected ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800")
                : cn("h-9 rounded-full border px-3", selected ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"),
            )}
            disabled={item.disabled}
            key={item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, item.id)}
            ref={(node) => { refs.current[item.id] = node; }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
