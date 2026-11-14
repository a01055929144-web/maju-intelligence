"use client";
import { useEffect, useState } from "react";

// 지도 검색창의 카카오 미등록 매장 검색(M2a). 검색어가 바뀌면 이전 요청을 취소하고(AbortController) 늦게 온 옛 응답은 버린다.
export type ExternalBusinessResult = {
  address: string;
  industry: string;
  kakaoPlaceUrl: string;
  name: string;
  phone: string;
  roadAddress: string;
};
type SearchState = { results: ExternalBusinessResult[]; message: string; loading: boolean };
const EMPTY: SearchState = { results: [], message: "", loading: false };

export function useBusinessSearch(query: string): SearchState {
  const [state, setState] = useState<SearchState>(EMPTY);
  useEffect(() => {
    const keyword = query.trim();
    if (keyword.length < 2) {
      setState((current) => (current.results.length || current.message || current.loading ? EMPTY : current));
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/business-search?query=${encodeURIComponent(keyword)}`, { cache: "no-store", signal: controller.signal });
        const payload = response.ok ? await response.json().catch(() => null) : null;
        if (controller.signal.aborted) return;
        const results: ExternalBusinessResult[] = Array.isArray(payload?.results) ? payload.results : [];
        setState({ results, message: results.length ? "" : payload?.message || "", loading: false });
      } catch {
        if (!controller.signal.aborted) setState(EMPTY);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return state;
}
