"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";

type MatchItem = { id: string; level: number; name: string; path: string; majuCategoryId: string; commonCategoryName: string; suggestion: null | { id: string; name: string; score: number } };
type Workspace = { businessType: string; options: Array<{ id: string; name: string }>; categories: MatchItem[] };

export function CommonCategoryMappingWorkspace({ companyId = "" }: { companyId?: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const suffix = companyId ? `?${new URLSearchParams({ companyId })}` : "";
      const response = await fetch(`/api/product-categories/matches${suffix}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "카테고리 연결을 불러오지 못했습니다.");
      setWorkspace(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리 연결을 불러오지 못했습니다.");
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => workspace?.categories.filter((item) => item.path.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))) || [], [query, workspace]);
  const unmapped = workspace?.categories.filter((item) => !item.majuCategoryId).length || 0;

  async function save(item: MatchItem, majuCategoryId: string) {
    setSaving(item.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/product-categories/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: companyId || undefined, categoryId: item.id, majuCategoryId: majuCategoryId || null }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "카테고리 연결을 저장하지 못했습니다.");
      const commonCategoryName = workspace?.options.find((option) => option.id === majuCategoryId)?.name || "기타";
      setWorkspace((current) => current && ({ ...current, categories: current.categories.map((row) => row.id === item.id ? { ...row, majuCategoryId, commonCategoryName } : row) }));
      setMessage(`“${item.path}”을(를) “${commonCategoryName}”(으)로 저장했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리 연결을 저장하지 못했습니다.");
    } finally { setSaving(""); }
  }

  return <div className="space-y-4">
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="maju-section-title">유통사 분류 → 공통 카테고리</h1><p className="mt-1 maju-muted-label">매핑하지 않은 분류는 매장 주문의 ‘전체’에서 <b>기타</b>로 표시됩니다.</p></div>
        <Link className="maju-button-secondary min-h-11 px-4" href="/revenue/products">상품관리로 돌아가기</Link>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <SearchInput aria-label="유통사 분류 검색" onChange={setQuery} placeholder="대·중·소 분류 이름 검색" value={query} />
        <p className="text-sm font-semibold text-slate-600">회사 업종 {workspace?.businessType || "미설정"} · 미연결 {unmapped}개</p>
      </div>
    </section>
    {message ? <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900" role="status">{message}</p> : null}
    {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4" role="alert"><p className="text-sm font-bold text-rose-800">{error}</p><button className="maju-button-secondary mt-3 min-h-11 px-4" onClick={() => void load()} type="button">다시 시도</button></div> : null}
    {!workspace && !error ? <p className="maju-section-card p-6 text-sm text-slate-600" role="status">공통 카테고리를 불러오는 중입니다.</p> : null}
    {workspace && visible.length === 0 ? <p className="maju-section-card p-6 text-sm text-slate-600">{query ? "검색 결과가 없습니다. 다른 분류 이름을 입력해 주세요." : "연결할 유통사 카테고리가 없습니다. 상품관리에서 분류를 먼저 등록해 주세요."}</p> : null}
    {visible.length ? <section className="maju-section-card overflow-hidden"><div className="hidden grid-cols-[100px_minmax(180px,1fr)_minmax(240px,1fr)] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 sm:grid"><span>단계</span><span>유통사 대·중·소 분류</span><span>매장 주문 공통 분류</span></div><div className="divide-y">{visible.map((item) => <div className="grid gap-2 p-4 sm:grid-cols-[100px_minmax(180px,1fr)_minmax(240px,1fr)] sm:items-center" key={item.id}><span className="text-xs font-bold text-slate-500">{item.level}단계</span><div className="min-w-0"><p className="break-words text-sm font-bold text-slate-900">{item.path}</p>{item.suggestion && !item.majuCategoryId ? <p className="mt-1 text-xs text-teal-700">추천 {item.suggestion.name} · {item.suggestion.score}%</p> : null}</div><label className="grid gap-1 text-xs font-semibold text-slate-600"><span className="sm:sr-only">{item.path} 공통 분류</span><select aria-label={`${item.path} 공통 분류`} className="maju-input min-h-11 w-full" disabled={saving === item.id} onChange={(event) => void save(item, event.target.value)} value={item.majuCategoryId}><option value="">기타 (미연결)</option>{workspace?.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>{saving === item.id ? <span role="status">저장 중…</span> : <span>현재 표시: {item.commonCategoryName}</span>}</label></div>)}</div></section> : null}
  </div>;
}
