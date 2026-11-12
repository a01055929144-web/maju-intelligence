"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { parseStorePriceInput, priceDifference, type StorePriceSource } from "@/domains/pricing/store-price";

// CC-30b: 매장 가격 — 왼쪽 매장 목록(검색·등급·"매장 가격 N개"), 오른쪽 이 매장의 상품별 가격표. "이 매장 가격" 칸을 고치면(Enter·칸 밖 클릭) 바로 저장, 비우면 끝내기.
type Store = { id: string; name: string; grade: string | null; gradeId: string | null; priceCount: number };
type Grade = { id: string; name: string };
type Row = { productId: string; name: string; category: string; basePrice: number; storePrice: number | null; since: string | null; source: StorePriceSource };
const badge: Record<StorePriceSource, string> = { 기본: "bg-slate-100 text-slate-600", 매장: "bg-indigo-100 text-indigo-800", 견적: "border border-indigo-400 text-indigo-800" };

export function PricingStorePrices({ companyId, userKey }: { companyId: string; userKey: string }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [q, setQ] = useState("");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [onlyStore, setOnlyStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchJson = useCallback(async <T,>(params: Record<string, string>): Promise<T> => {
    const response = await fetch(`/api/store-prices?${new URLSearchParams({ companyId, ...params })}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as T & { message?: string };
    if (!response.ok) throw new Error(body.message || "불러오지 못했습니다.");
    return body;
  }, [companyId]);

  const loadStores = useCallback(async () => {
    try { const body = await fetchJson<{ stores: Store[]; grades: Grade[] }>({ q }); setStores(body.stores); setGrades(body.grades); } catch (e) { setError(e instanceof Error ? e.message : "매장을 불러오지 못했습니다."); }
  }, [fetchJson, q]);
  useEffect(() => { void loadStores(); }, [loadStores]);

  const loadRows = useCallback(async (customerId: string) => {
    try { setRows((await fetchJson<{ rows: Row[] }>({ customerId })).rows); } catch (e) { setError(e instanceof Error ? e.message : "가격을 불러오지 못했습니다."); }
  }, [fetchJson]);
  useEffect(() => { setRows([]); if (store) void loadRows(store.id); }, [store, loadRows]);

  async function save(row: Row, price: number | null) {
    if (!store) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/customers/${store.id}/contract-prices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: row.productId, price }) });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(body.message || "저장하지 못했습니다.");
      setMessage(price === null ? `${row.name}: 이 매장 가격을 끝냈습니다(기본 판매가로 돌아감).` : `${row.name}: 이 매장 가격을 ${price.toLocaleString()}원으로 정했습니다.`);
      await Promise.all([loadRows(store.id), loadStores()]);
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function changeGrade(gradeId: string) {
    if (!store) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/margin-templates/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, customerId: store.id, templateId: gradeId || null }) });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(body.message || "등급을 바꾸지 못했습니다.");
      const name = grades.find((g) => g.id === gradeId)?.name ?? null;
      setStore({ ...store, gradeId: gradeId || null, grade: name });
      setMessage(`${store.name}: 등급을 ${name ?? "기본"}(으)로 바꿨습니다.`);
      await loadStores();
    } catch (e) { setError(e instanceof Error ? e.message : "등급을 바꾸지 못했습니다."); }
    finally { setBusy(false); }
  }

  const visible = useMemo(() => (onlyStore ? rows.filter((r) => r.storePrice !== null) : rows), [rows, onlyStore]);
  const columns: CommonTableColumn<Row>[] = [
    { key: "name", label: "상품", value: (r) => r.name, sortable: true, render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: "category", label: "분류", value: (r) => r.category || "미분류", sortable: true },
    { key: "base", label: "기본 판매가", value: (r) => r.basePrice, align: "right", sortable: true, render: (r) => `${r.basePrice.toLocaleString()}원` },
    { key: "store", label: "이 매장 가격", value: (r) => r.storePrice, align: "right", sortable: true, render: (r) => r.source === "견적"
      ? <span title="견적서 수락으로 생긴 가격 — 거래처 상세에서 종료">{r.storePrice?.toLocaleString()}원</span>
      : <input aria-label={`${r.name} 이 매장 가격`} className="h-8 w-24 rounded border border-slate-300 px-1.5 text-right text-sm font-bold" defaultValue={r.storePrice ?? ""} disabled={busy} inputMode="numeric" key={`${r.productId}-${r.storePrice}`} placeholder="기본가"
          onBlur={(e) => {
            const next = parseStorePriceInput(e.currentTarget.value);
            if (next === undefined) { e.currentTarget.value = String(r.storePrice ?? ""); setError("가격은 0 이상의 숫자(원)로 입력하거나 비워 주세요."); return; }
            if (next === r.storePrice) return;
            void save(r, next);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = String(r.storePrice ?? ""); e.currentTarget.blur(); } }} /> },
    { key: "diff", label: "차이", value: (r) => priceDifference(r.basePrice, r.storePrice), align: "right", render: (r) => { const d = priceDifference(r.basePrice, r.storePrice); return d === null ? "-" : <span className={d < 0 ? "text-rose-700" : ""}>{d > 0 ? "+" : ""}{d.toLocaleString()}원</span>; } },
    { key: "source", label: "출처", value: (r) => r.source, render: (r) => <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badge[r.source]}`}>{r.source}</span> },
    { key: "since", label: "시작일", value: (r) => r.since ?? "", render: (r) => r.since ?? "-" },
  ];

  return <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
    <aside aria-label="매장" className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
      <input aria-label="매장 찾기" className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" onChange={(e) => setQ(e.target.value)} placeholder="매장 찾기" value={q} />
      <ul className="max-h-[60vh] divide-y overflow-y-auto">
        {stores.map((s) => <li key={s.id}><button aria-pressed={store?.id === s.id} className={`flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-sm ${store?.id === s.id ? "bg-teal-50 text-teal-800" : "hover:bg-slate-50"}`} onClick={() => { setStore(s); setMessage(""); setError(""); }} type="button">
          <span className="min-w-0 truncate font-semibold">{s.name}</span>
          <span className="shrink-0 text-xs text-slate-500">{s.grade ? `${s.grade} · ` : ""}{s.priceCount ? `매장 가격 ${s.priceCount}` : ""}</span></button></li>)}
        {!stores.length ? <li className="p-3 text-center text-xs text-slate-500">매장이 없습니다.</li> : null}
      </ul>
    </aside>
    <div className="min-w-0 space-y-2">
      {error ? <p className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p> : null}
      {message ? <p className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900" role="status">{message}</p> : null}
      {store ? <>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-black">{store.name}</h2>
          {grades.length ? <label className="flex items-center gap-1 text-xs font-bold text-slate-600">등급<select aria-label="이 매장 등급" className="h-8 rounded border border-slate-300 px-1.5 text-sm" disabled={busy} onChange={(e) => void changeGrade(e.target.value)} value={store.gradeId ?? ""}><option value="">기본</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label> : null}
          <button aria-pressed={onlyStore} className={`min-h-[32px] rounded-full border px-3 text-xs font-bold ${onlyStore ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-600"}`} onClick={() => setOnlyStore(!onlyStore)} type="button">이 매장만 다른 가격</button></div>
        <CommonDataTable columns={columns} emptyMessage="표시할 상품이 없습니다. 가격 관리에서 판매가를 먼저 정해 주세요." filename={`${store.name}-매장가격.csv`} rowKey={(r) => r.productId} rows={visible} settingsKey={`store-prices:${userKey}`} />
      </> : <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-500">왼쪽에서 매장을 고르세요.</p>}
    </div>
  </div>;
}
