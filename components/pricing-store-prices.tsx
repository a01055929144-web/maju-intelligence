"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { StoreGradeManager } from "./store-grade-manager";
import { parseStorePriceInput, priceDifference, type StorePriceSource } from "@/domains/pricing/store-price";

// CC-30b: 매장 가격 — 왼쪽 매장 목록(검색·등급·"매장 가격 N개"), 오른쪽 이 매장의 상품별 가격표. "이 매장 가격" 칸을 고치면(Enter·칸 밖 클릭) 바로 저장, 비우면 끝내기.
type Store = { id: string; name: string; grade: string | null; gradeId: string | null; priceCount: number };
type Grade = { id: string; name: string };
type Row = { productId: string; name: string; category: string; basePrice: number; storePrice: number | null; since: string | null; until: string | null; planned: { price: number; since: string } | null; source: StorePriceSource };
const badge: Record<StorePriceSource, string> = { 기본: "bg-slate-100 text-slate-600", 매장: "bg-indigo-100 text-indigo-800", 견적: "border border-indigo-400 text-indigo-800" };

export function PricingStorePrices({ companyId, userKey }: { companyId: string; userKey: string }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [q, setQ] = useState("");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [onlyStore, setOnlyStore] = useState(false);
  const [periodProductId, setPeriodProductId] = useState<string | null>(null);
  const [plannedFrom, setPlannedFrom] = useState("");
  const [plannedPrice, setPlannedPrice] = useState("");
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

  async function save(row: Row, price: number | null, until: string | null = null, from: string | null = null) {
    if (!store) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/customers/${store.id}/contract-prices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: row.productId, price, until, from }) });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(body.message || "저장하지 못했습니다.");
      setMessage(price === null ? (from ? `${row.name}: 예정 가격을 취소했습니다.` : `${row.name}: 이 매장 가격을 끝냈습니다(기본 판매가로 돌아감).`) : from ? `${row.name}: ${from}부터 ${price.toLocaleString()}원으로 바뀝니다.` : `${row.name}: 이 매장 가격을 ${price.toLocaleString()}원으로 정했습니다.`);
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
      if (!response.ok) throw new Error(body.message || "카탈로그를 바꾸지 못했습니다.");
      const name = grades.find((g) => g.id === gradeId)?.name ?? null;
      setStore({ ...store, gradeId: gradeId || null, grade: name });
      setMessage(`${store.name}: 카탈로그를 ${name ?? "기본"}(으)로 바꿨습니다.`);
      await loadStores();
    } catch (e) { setError(e instanceof Error ? e.message : "카탈로그를 바꾸지 못했습니다."); }
    finally { setBusy(false); }
  }

  function commitPrice(r: Row, el: HTMLInputElement) {
    const next = parseStorePriceInput(el.value);
    if (next === undefined) { el.value = String(r.storePrice ?? ""); setError("가격은 0 이상의 숫자(원)로 입력하거나 비워 주세요."); return; }
    if (next === r.storePrice) return;
    void save(r, next);
  }
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  const periodRow = rows.find((r) => r.productId === periodProductId) ?? null;
  const setPeriodRow = (r: Row | null) => { setPeriodProductId(r?.productId ?? null); setPlannedFrom(""); setPlannedPrice(""); };
  const visible = useMemo(() => (onlyStore ? rows.filter((r) => r.storePrice !== null) : rows), [rows, onlyStore]);
  const columns: CommonTableColumn<Row>[] = [
    { key: "name", label: "상품", value: (r) => r.name, sortable: true, searchable: true, weight: 3, render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: "category", label: "분류", value: (r) => r.category || "미분류", sortable: true, searchable: true, priority: 3 },
    { key: "base", label: "기본 판매가", value: (r) => r.basePrice, align: "right", sortable: true, width: 110, render: (r) => `${r.basePrice.toLocaleString()}원` },
    { key: "store", label: "이 매장 가격", value: (r) => r.storePrice, align: "right", sortable: true, width: 120, render: (r) => r.source === "견적"
      ? <span title="견적서 수락으로 생긴 가격 — 거래처 상세에서 종료">{r.storePrice?.toLocaleString()}원</span>
      : <input aria-label={`${r.name} 이 매장 가격`} className="h-8 w-24 rounded border border-slate-300 px-1.5 text-right text-sm font-bold" defaultValue={r.storePrice ?? ""} disabled={busy} inputMode="numeric" key={`${r.productId}-${r.storePrice}`} placeholder="기본가"
          onBlur={(e) => commitPrice(r, e.currentTarget)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = String(r.storePrice ?? ""); e.currentTarget.blur(); } }} /> },
    { key: "diff", label: "차이", value: (r) => priceDifference(r.basePrice, r.storePrice), align: "right", priority: 2, width: 100, render: (r) => { const d = priceDifference(r.basePrice, r.storePrice); return d === null ? "-" : <span className={d < 0 ? "text-rose-700" : ""}>{d > 0 ? "+" : ""}{d.toLocaleString()}원</span>; } },
    { key: "source", label: "출처", value: (r) => r.source, priority: 2, width: 80, render: (r) => <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badge[r.source]}`}>{r.source}</span> },
    { key: "period", label: "기간·예정", value: (r) => r.until ?? r.planned?.since ?? "", priority: 3, width: 220, sortable: false, render: (r) => r.source === "견적" ? "-" : <span className="flex items-center gap-1.5 text-xs">
      {r.storePrice !== null && r.until ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">~{r.until.slice(5).replace("-", "/")}</span> : null}
      {r.planned ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">{r.planned.since.slice(5).replace("-", "/")}부터 {r.planned.price.toLocaleString()}원</span> : null}
      <button aria-label={`${r.name} 기간·예정 가격`} className="h-7 rounded border border-slate-300 px-2 font-black text-slate-600" disabled={busy} onClick={() => setPeriodRow(r)} type="button">⋯</button></span> },
  ];

  return <div className="space-y-3">
    <div aria-label="매장" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
      <input aria-label="매장 찾기" className="h-9 w-48 rounded-md border border-slate-300 px-2 text-sm" onChange={(e) => setQ(e.target.value)} placeholder="매장 찾기" value={q} />
      <select aria-label="매장 선택" className="h-9 min-w-0 max-w-full flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold sm:max-w-md" onChange={(e) => { setStore(stores.find((x) => x.id === e.target.value) ?? null); setMessage(""); setError(""); }} value={store?.id ?? ""}>
        <option value="">{stores.length ? "매장을 고르세요" : "매장이 없습니다"}</option>
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade ? ` · ${s.grade}` : ""}{s.priceCount ? ` · 매장 가격 ${s.priceCount}` : ""}</option>)}
      </select>
      <StoreGradeManager companyId={companyId} onChanged={() => void loadStores()} />
    </div>
    <div className="min-w-0 space-y-2">
      {error ? <p className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p> : null}
      {message ? <p className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900" role="status">{message}</p> : null}
      {store ? <>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-black">{store.name}</h2>
          {grades.length ? <label className="flex items-center gap-1 text-xs font-bold text-slate-600">카탈로그<select aria-label="이 매장 카탈로그" className="h-8 rounded border border-slate-300 px-1.5 text-sm" disabled={busy} onChange={(e) => void changeGrade(e.target.value)} value={store.gradeId ?? ""}><option value="">기본</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label> : null}
          <button aria-pressed={onlyStore} className={`min-h-[32px] rounded-full border px-3 text-xs font-bold ${onlyStore ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-600"}`} onClick={() => setOnlyStore(!onlyStore)} type="button">이 매장만 다른 가격</button></div>
        <div className="hidden lg:block"><CommonDataTable columns={columns} emptyMessage="표시할 상품이 없습니다. 가격 관리에서 판매가를 먼저 정해 주세요." filename={`${store.name}-매장가격.csv`} rowKey={(r) => r.productId} rows={visible} settingsKey={`store-prices:${userKey}`} /></div>
        <ul className="space-y-2 lg:hidden">{visible.map((r) => <li className="rounded-xl border border-slate-200 bg-white p-3" key={r.productId}>
          <div className="flex items-start justify-between gap-2"><span className="font-bold">{r.name}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${badge[r.source]}`}>{r.source}</span></div>
          <p className="text-xs text-slate-500">{r.category || "미분류"} · 기본 {r.basePrice.toLocaleString()}원{r.storePrice !== null ? ` · 차이 ${(r.storePrice - r.basePrice).toLocaleString()}원` : ""}</p>
          {r.source === "견적" ? <p className="mt-2 text-sm font-bold">{r.storePrice?.toLocaleString()}원 <span className="text-xs font-normal text-slate-500">견적 가격 — 거래처 상세에서 종료</span></p>
            : <div className="mt-2 flex flex-wrap items-center gap-2"><label className="text-xs font-bold text-slate-600">이 매장 가격<input aria-label={`${r.name} 이 매장 가격`} className="ml-1 h-11 w-28 rounded border border-slate-300 px-2 text-right text-base font-bold" defaultValue={r.storePrice ?? ""} disabled={busy} inputMode="numeric" key={`m-${r.productId}-${r.storePrice}`} onBlur={(e) => commitPrice(r, e.currentTarget)} placeholder="기본가" /></label>
              {r.storePrice !== null ? <label className="text-xs font-bold text-slate-600">끝나는 날<input aria-label={`${r.name} 끝나는 날`} className="ml-1 h-11 rounded border border-slate-300 px-1 text-sm" defaultValue={r.until ?? ""} disabled={busy} key={`mu-${r.productId}-${r.until}`} min={today} onChange={(e) => { if (e.currentTarget.value !== (r.until ?? "")) void save(r, r.storePrice, e.currentTarget.value || null); }} type="date" /></label> : null}</div>}
          {r.planned ? <p className="mt-1 text-xs text-slate-600">{r.planned.since}부터 <b>{r.planned.price.toLocaleString()}원</b> 예정</p> : null}
        </li>)}
          {!visible.length ? <li className="p-6 text-center text-sm text-slate-500">표시할 상품이 없습니다. 가격 관리에서 판매가를 먼저 정해 주세요.</li> : null}</ul>
      {periodRow && store ? <div aria-label={`${periodRow.name} 기간·예정 가격`} className="fixed inset-y-0 right-0 z-50 w-full max-w-sm space-y-4 overflow-y-auto border-l border-slate-300 bg-white p-4 shadow-xl" role="dialog">
        <div className="flex items-start justify-between gap-2"><div><h3 className="text-base font-black">기간·예정 가격</h3><p className="text-xs text-slate-500">{store.name} · {periodRow.name}</p></div><button className="maju-button-secondary h-8 text-xs" onClick={() => setPeriodRow(null)} type="button">닫기</button></div>
        {periodRow.storePrice !== null ? <label className="block text-sm font-bold">끝나는 날<input aria-label={`${periodRow.name} 끝나는 날`} className="mt-1 block h-9 w-full rounded border border-slate-300 px-2" defaultValue={periodRow.until ?? ""} disabled={busy} key={`until-${periodRow.until}`} min={today} onChange={(e) => { if (e.currentTarget.value !== (periodRow.until ?? "")) void save(periodRow, periodRow.storePrice, e.currentTarget.value || null); }} type="date" /><span className="text-xs font-normal text-slate-500">시작일 {periodRow.since ?? "-"} · 비우면 계속 적용</span></label> : <p className="text-xs text-slate-500">이 매장 가격이 없어 끝나는 날은 정할 수 없습니다.</p>}
        {periodRow.planned
          ? <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">{periodRow.planned.since}부터 <b>{periodRow.planned.price.toLocaleString()}원</b> 예정 <button className="ml-1 font-bold text-rose-700" disabled={busy} onClick={() => void save(periodRow, null, null, periodRow.planned!.since)} type="button">취소</button></p>
          : <div className="space-y-2"><p className="text-sm font-bold">예정 가격</p>
            <input aria-label={`${periodRow.name} 예정 시작일`} className="block h-9 w-full rounded border border-slate-300 px-2 text-sm" min={new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10)} onChange={(e) => setPlannedFrom(e.target.value)} type="date" value={plannedFrom} />
            <input aria-label={`${periodRow.name} 예정가`} className="block h-9 w-full rounded border border-slate-300 px-2 text-right text-sm" inputMode="numeric" onChange={(e) => setPlannedPrice(e.target.value)} placeholder="예정가(원)" value={plannedPrice} />
            <button className="maju-button h-9 text-sm" disabled={busy} onClick={() => { const next = parseStorePriceInput(plannedPrice); if (next === undefined || next === null || !plannedFrom) { setError("예정 가격은 시작일과 0 이상의 숫자(원)를 함께 입력해 주세요."); return; } void save(periodRow, next, null, plannedFrom).then(() => setPeriodRow(null)); }} type="button">예정 가격 저장</button></div>}
      </div> : null}
      </> : <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-500">위에서 매장을 고르세요.</p>}
    </div>
  </div>;
}
