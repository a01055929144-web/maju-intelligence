"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import type { PickedAddress } from "@/domains/customer/address-line";

/**
 * CC-48-2: 거래처 주소를 /api/address-search(회사 정보·매장 가입과 같은 API)로 검색해 고른다.
 * 고른 결과의 좌표(latitude/longitude)도 onPick으로 넘긴다 — 좌표 저장은 CC-48-5에서(지금은 받는 쪽이 무시해도 된다).
 */
export function AddressPicker({ onPick, value }: { readonly onPick: (picked: PickedAddress) => void; readonly value: string }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PickedAddress[]>([]);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);

  async function search() {
    if (query.trim().length < 2) { setMessage("주소를 2글자 이상 입력해 주세요."); return; }
    setSearching(true); setMessage(""); setResults([]);
    try {
      const response = await fetch(`/api/address-search?query=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { message?: string; results?: PickedAddress[] } | null;
      const found = response.ok && Array.isArray(payload?.results) ? payload.results : [];
      setResults(found);
      setMessage(response.ok ? (found.length ? "정확한 주소를 선택해 주세요." : "검색 결과가 없습니다. 도로명이나 지번을 확인해 주세요.") : payload?.message || "주소 검색에 실패했습니다.");
    } catch { setMessage("주소 검색에 실패했습니다. 다시 시도해 주세요."); }
    finally { setSearching(false); }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <SearchInput className="min-w-0 flex-1" inputProps={{ "aria-label": "주소 검색", onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } } }} onChange={setQuery} placeholder="도로명 또는 지번 검색" value={query} />
        <Button className="max-sm:min-h-11" disabled={searching} onClick={() => void search()} type="button">{searching ? "검색 중" : "주소 검색"}</Button>
      </div>
      {message ? <p className="text-xs font-bold text-slate-600" role="status">{message}</p> : null}
      {results.length ? (
        <div className="max-h-48 overflow-y-auto rounded-md border border-slate-300 bg-white">
          {results.map((result, index) => (
            <button className="block min-h-11 w-full border-b border-slate-200 px-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-50" key={`${result.address}-${index}`} onClick={() => { onPick(result); setQuery(result.address); setResults([]); setMessage("주소를 선택했습니다."); }} type="button">
              {result.address}{result.postalCode ? ` (${result.postalCode})` : ""}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
