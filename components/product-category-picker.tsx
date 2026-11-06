"use client";

import { useState } from "react";
import { cleanCategory, splitCategory } from "@/domains/pricing/product-category";

/** 긴 브라우저 기본 드롭다운 대신 표 안에서 열리는 짧은 분류 검색 목록. */
export function ProductCategoryPicker({ label, value, options, onChange }: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [parent, setParent] = useState("");
  const normalized = query.trim().toLocaleLowerCase("ko");
  const choices = options.filter((path) => normalized
    ? path.toLocaleLowerCase("ko").includes(normalized)
    : parent ? path.startsWith(`${parent} > `) && splitCategory(path).length === splitCategory(parent).length + 1 : splitCategory(path).length === 1).slice(0, 12);
  const custom = cleanCategory(query);
  const canCreate = normalized && typeof custom === "string" && !options.includes(custom);
  const choose = (next: string) => { onChange(next); setQuery(""); setParent(""); setOpen(false); };

  return <div className="min-w-[180px] text-sm">
    <button aria-expanded={open} aria-label={label} className="maju-input flex h-9 w-full items-center justify-between gap-2 bg-white text-left text-slate-900" onClick={() => setOpen((current) => !current)} type="button">
      <span className="min-w-0 truncate">{value ? value.replace(/ > /g, " › ") : "분류 선택"}</span><span aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="mt-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-900 shadow-sm">
      <input aria-label={`${label} 검색어`} autoFocus className="maju-input h-9 w-full" onChange={(event) => setQuery(event.target.value)} placeholder="분류 이름 검색" value={query} />
      {!normalized && parent ? <button className="mt-1 text-xs text-teal-700 underline" onClick={() => setParent(splitCategory(parent).slice(0, -1).join(" > "))} type="button">← {parent.replace(/ > /g, " › ")} 이전</button> : null}
      <div className="mt-1 max-h-48 overflow-y-auto">
        {choices.map((path) => <div className="flex items-center gap-1" key={path}><button className="min-h-9 min-w-0 flex-1 truncate rounded px-2 text-left hover:bg-teal-50" onClick={() => choose(path)} title={path} type="button">{path.replace(/ > /g, " › ")}</button>{!normalized && options.some((next) => next.startsWith(`${path} > `)) ? <button aria-label={`${path} 하위 분류 보기`} className="min-h-9 rounded px-2 text-teal-700 hover:bg-teal-50" onClick={() => setParent(path)} type="button">›</button> : null}</div>)}
        {!choices.length ? <p className="px-2 py-2 text-slate-500">맞는 분류가 없습니다.</p> : null}
      </div>
      {canCreate && typeof custom === "string" ? <button className="mt-1 w-full rounded border border-teal-200 px-2 py-1.5 text-left text-teal-700" onClick={() => choose(custom)} type="button">+ 「{custom.replace(/ > /g, " › ")}」 새 분류로 선택</button> : null}
      {value ? <button className="mt-1 text-xs text-slate-500 underline" onClick={() => choose("")} type="button">분류 비우기</button> : null}
    </div> : null}
  </div>;
}
