"use client";

import { useEffect, useMemo, useState } from "react";
import { BASKET_INDUSTRIES, type IndustryBasketInput } from "@/domains/pricing/industry-basket";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { Button } from "@/components/ui/button";

type Product = { id: string; code: string | null; name: string; unit: string };
type Row = IndustryBasketInput & { industry: string };

export function IndustryBasketSettings() {
  const [industry, setIndustry] = useState<string>(BASKET_INDUSTRIES[0]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const rows = allRows.filter((row) => row.industry === industry).sort((a, b) => a.sortOrder - b.sortOrder);
  const chosen = new Set(rows.map((row) => row.productCatalogId));
  const candidates = useMemo(() => products.filter((product) => !chosen.has(product.id) && `${product.code || ""} ${product.name}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30), [chosen, products, query]);

  useEffect(() => {
    void fetch("/api/customer/industry-baskets", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { products?: Product[]; rows?: Row[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "불러오지 못했습니다.");
      setProducts(payload.products || []); setAllRows(payload.rows || []); setState("ready");
    }).catch((error) => { setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."); setState("error"); });
  }, []);

  function patch(productCatalogId: string, next: Partial<Row>) {
    setAllRows((current) => current.map((row) => row.industry === industry && row.productCatalogId === productCatalogId ? { ...row, ...next } : row));
  }
  function add(product: Product) {
    setAllRows((current) => [...current, { industry, productCatalogId: product.id, defaultQty: 1, isCore: false, sortOrder: rows.length }]);
    setQuery("");
  }
  async function save() {
    setMessage("저장 중입니다…");
    const response = await fetch("/api/customer/industry-baskets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ industry, rows }) });
    const payload = await response.json().catch(() => ({})) as { message?: string };
    setMessage(response.ok ? `${industry} 기본 품목을 저장했습니다.` : payload.message || "저장하지 못했습니다.");
  }

  if (state === "loading") return <LoadingState label="업종별 기본 품목을 불러오는 중입니다…" />;
  if (state === "error") return <ErrorState message={message} />;
  return <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4" aria-label="업종별 기본 품목">
    <div><h2 className="font-semibold text-slate-950">업종별 기본 품목</h2><p className="mt-1 text-sm text-slate-600">견적과 단가표를 만들 때 먼저 담을 품목과 수량을 정합니다.</p></div>
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="업종 선택">{BASKET_INDUSTRIES.map((item) => <button className={`min-h-11 shrink-0 rounded-md border px-3 text-sm font-semibold ${industry === item ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200"}`} key={item} onClick={() => { setIndustry(item); setMessage(""); }} type="button">{item}</button>)}</div>
    {rows.length ? <div className="space-y-2">{rows.map((row) => { const product = products.find((item) => item.id === row.productCatalogId); return <div className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_120px_auto_auto] sm:items-center" key={row.productCatalogId}>
      <div className="min-w-0"><p className="truncate font-medium">{product?.name || "숨김 또는 삭제된 품목"}</p><p className="text-xs text-slate-500">{product?.code || "코드 없음"} · {product?.unit || "EA"}</p></div>
      <label className="text-xs text-slate-600">기본 수량<input aria-label={`${product?.name || "품목"} 기본 수량`} className="mt-1 min-h-11 w-full rounded-md border px-2 text-sm" min="0.001" onChange={(event) => patch(row.productCatalogId, { defaultQty: Number(event.target.value) })} step="0.001" type="number" value={row.defaultQty} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input checked={row.isCore} onChange={(event) => patch(row.productCatalogId, { isCore: event.target.checked })} type="checkbox" />핵심</label>
      <button className="min-h-11 text-sm font-semibold text-red-600" onClick={() => setAllRows((current) => current.filter((item) => !(item.industry === industry && item.productCatalogId === row.productCatalogId)))} type="button">빼기</button>
    </div>; })}</div> : <EmptyState bare message="이 업종에 담긴 기본 품목이 없습니다." description="아래에서 품목을 검색해 추가해 주세요." />}
    <div className="space-y-2 border-t pt-4"><SearchInput aria-label="추가할 품목 검색" onChange={setQuery} placeholder="품목명·코드 검색" value={query} />{query && <div className="max-h-56 overflow-y-auto rounded-md border">{candidates.length ? candidates.map((product) => <button className="flex min-h-11 w-full items-center justify-between border-b px-3 text-left text-sm last:border-0" key={product.id} onClick={() => add(product)} type="button"><span className="truncate">{product.name}</span><span className="ml-3 shrink-0 text-teal-700">추가</span></button>) : <p className="p-3 text-sm text-slate-500">검색 결과가 없습니다.</p>}</div>}</div>
    {message && <p className="text-sm" role="status">{message}</p>}
    <div className="flex justify-end"><Button onClick={() => void save()}>이 업종 저장</Button></div>
  </section>;
}
