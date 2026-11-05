"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { summarizePurchaseHistory, type PurchaseHistoryRow } from "@/domains/pricing/purchase-receipt";

const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

/** 11/4: 매일 올린 매입 엑셀의 품목별 단가 변동·수량을 한눈에 봅니다. */
export function PurchaseHistoryPanel({ companyId, refreshKey }: { readonly companyId: string; readonly refreshKey: number }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [canCorrect, setCanCorrect] = useState(false);
  const [editing, setEditing] = useState<{ id: string; cost: string; revision: number } | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [productChoices, setProductChoices] = useState<Array<{ id: string; name: string; spec?: string; productCode?: string }>>([]);
  const [productId, setProductId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PurchaseHistoryRow[] | null>(null);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [open, setOpen] = useState<string>("");
  const [detail, setDetail] = useState<{ key: string; rows: PurchaseHistoryRow[]; page: number; hasMore: boolean; loading: boolean } | null>(null);

  useEffect(() => { setOpen(""); setDetail(null); }, [companyId, from, to, search]);

  useEffect(() => {
    let active = true;
    if (page === 1) setRows(null);
    setError("");
    setLoading(true);
    const params = new URLSearchParams({ companyId, page: String(page) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search) params.set("search", search);
    if (onlyChanged) params.set("changed", "1");
    void fetch(`/api/price-sheets/receipts?${params}`, { cache: "no-store" }).then(async (response) => {
      const payload = (await response.json().catch(() => null)) as { rows?: PurchaseHistoryRow[]; canCorrect?: boolean; hasMore?: boolean; message?: string } | null;
      if (!active) return;
      if (!response.ok || !payload?.rows) { setError(payload?.message || "매입 이력을 불러오지 못했습니다."); if (page === 1) setRows([]); setLoading(false); return; }
      setRows((previous) => page === 1 ? payload.rows! : [...(previous || []), ...payload.rows!]);
      setCanCorrect(payload.canCorrect === true);
      setHasMore(payload.hasMore === true);
      setLoading(false);
    }).catch(() => { if (active) { setError("매입 이력을 불러오지 못했습니다. 다시 시도해 주세요."); if (page === 1) setRows([]); setLoading(false); } });
    return () => { active = false; };
  }, [companyId, from, to, search, onlyChanged, page, refreshKey, reloadKey]);

  async function findProducts() {
    if (!productQuery.trim()) return;
    try {
      const response = await fetch(`/api/product-catalog?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(productQuery)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { items?: typeof productChoices; message?: string } | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || "상품을 찾지 못했습니다.");
      setProductChoices(payload.items.slice(0, 30));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "상품을 찾지 못했습니다."); }
  }

  async function saveCorrection() {
    if (!editing || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/price-sheets/receipts", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, id: editing.id, productId: productId || undefined, cost: Number(editing.cost), reason, expectedRevision: editing.revision }) });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "정정을 저장하지 못했습니다.");
      setEditing(null);
      setOpen("");
      setDetail(null);
      setProductChoices([]);
      setProductId("");
      setReason("");
      setPage(1);
      setReloadKey((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "정정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  async function loadProductHistory(item: { key: string; lineKey: string; name: string; supplier: string }, productId: string | null, nextPage = 1) {
    setOpen(item.key);
    setDetail((current) => ({ key: item.key, rows: nextPage === 1 ? [] : current?.rows || [], page: nextPage, hasMore: false, loading: true }));
    const params = new URLSearchParams({ companyId, page: String(nextPage) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (productId) params.set("productId", productId);
    else params.set("lineKey", item.lineKey);
    if (item.supplier) params.set("supplier", item.supplier);
    try {
      const response = await fetch(`/api/price-sheets/receipts?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as { rows?: PurchaseHistoryRow[]; hasMore?: boolean; message?: string };
      if (!response.ok || !payload.rows) throw new Error(payload.message || "품목 이력을 불러오지 못했습니다.");
      setDetail((current) => current?.key === item.key ? {
        key: item.key,
        rows: nextPage === 1 ? payload.rows! : [...current.rows, ...payload.rows!],
        page: nextPage,
        hasMore: payload.hasMore === true,
        loading: false
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "품목 이력을 불러오지 못했습니다.");
      setDetail((current) => current?.key === item.key ? { ...current, loading: false } : current);
    }
  }

  const items = useMemo(() => summarizePurchaseHistory(rows || []), [rows]);
  const dates = useMemo(() => new Set((rows || []).map((row) => row.receipt_date)).size, [rows]);
  const up = items.filter((item) => item.direction === "up").length;
  const down = items.filter((item) => item.direction === "down").length;

  return (
    <section className="maju-section-card min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">매입 이력</h2>
        <span className="text-xs font-semibold text-slate-500">불러온 기록 기준 {dates}일 · 품목 {items.length}개 · 인상 {up} · 인하 {down}</span>
        <label className="text-xs">시작일 <input aria-label="매입 시작일" className="maju-input min-h-11" onChange={(event) => { setFrom(event.target.value); setPage(1); }} type="date" value={from} /></label>
        <label className="text-xs">종료일 <input aria-label="매입 종료일" className="maju-input min-h-11" onChange={(event) => { setTo(event.target.value); setPage(1); }} type="date" value={to} /></label>
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><input checked={onlyChanged} onChange={(event) => { setOnlyChanged(event.target.checked); setPage(1); }} type="checkbox" />단가 바뀐 품목만</label>
        <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput); setPage(1); }}>
          <input aria-label="이력 검색" className="maju-input min-h-11" onChange={(event) => setSearchInput(event.target.value)} placeholder="품목·코드·매입처 검색" value={searchInput} />
          <button className="maju-button-secondary min-h-11" type="submit">검색</button>
        </form>
        {(from || to || searchInput || search) ? <button className="maju-button-secondary min-h-11" onClick={() => { setFrom(""); setTo(""); setSearchInput(""); setSearch(""); setPage(1); }} type="button">전체 보기</button> : null}
      </div>
      {error ? <div className="flex items-center gap-2 text-sm text-rose-700" role="alert">{error}<button className="maju-button-secondary min-h-11" onClick={() => setReloadKey((value) => value + 1)} type="button">다시 시도</button></div> : null}
      {rows === null ? <p className="text-sm text-slate-500">불러오는 중입니다.</p> : !items.length ? <p className="text-sm text-slate-500">조회 조건에 맞는 매입 기록이 없습니다. 기간이나 검색어를 바꿔 보세요.</p> : (
        <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">품목</th><th className="px-3 py-2">규격·단위</th><th className="px-3 py-2">매입처</th><th className="px-3 py-2">최근 매입일</th><th className="px-3 py-2 text-right">최근 단가</th><th className="px-3 py-2 text-right">직전 단가</th><th className="px-3 py-2 text-right">변동</th><th className="px-3 py-2 text-right">기간 최저~최고</th><th className="px-3 py-2 text-right">기간 수량</th><th className="px-3 py-2 text-right">횟수</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Fragment key={item.key}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold"><button className="min-h-11 text-left underline-offset-2 hover:underline" onClick={() => {
                      if (open === item.key) { setOpen(""); return; }
                      void loadProductHistory(item, rows?.find((row) => `${row.product_catalog_id || row.line_key}|${row.supplier_name || ""}` === item.key)?.product_catalog_id || null);
                    }} type="button">{item.name}</button></td>
                    <td className="px-3 py-2 text-slate-600">{[item.spec, item.unit || "단위 미지정"].filter(Boolean).join(" · ")}</td>
                    <td className="px-3 py-2 text-slate-600">{item.supplier || "매입처 미지정"}</td>
                    <td className="px-3 py-2 text-slate-600">{item.latestDate}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(item.latestCost)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.previousCost != null ? money(item.previousCost) : "-"}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${item.direction === "up" ? "text-rose-600" : item.direction === "down" ? "text-blue-600" : "text-slate-400"}`}>{item.changeAmount ? <>{item.direction === "up" ? "▲" : "▼"} {money(Math.abs(item.changeAmount))}{item.changeRate != null ? <span className="ml-1">({Math.abs(item.changeRate)}%)</span> : null}</> : "-"}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.minCost === item.maxCost ? money(item.minCost) : `${money(item.minCost)} ~ ${money(item.maxCost)}`}</td>
                    <td className="px-3 py-2 text-right">{item.totalQuantity ? `${item.totalQuantity.toLocaleString("ko-KR")}${item.unit ? ` ${item.unit}` : ""}` : "-"}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.count}</td>
                  </tr>
                  {open === item.key ? (
                    <tr className="bg-slate-50/70">
                      <td className="px-3 py-2" colSpan={10}>
                        <div className="flex flex-wrap gap-1.5">
                          {(detail?.key === item.key ? summarizePurchaseHistory(detail.rows).find((group) => group.key === item.key)?.entries || [] : []).map((entry, index, entries) => {
                            const prev = entries[index + 1];
                            const diff = prev ? entry.cost - prev.cost : 0;
                            return <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs" key={entry.id || `${entry.date}-${index}`}>{entry.date.slice(5)} · <b>{money(entry.cost)}</b>{entry.corrected ? " · 정정됨" : ""}{diff ? <span className={diff > 0 ? " text-rose-600" : " text-blue-600"}> {diff > 0 ? "+" : ""}{diff.toLocaleString("ko-KR")}</span> : null}{entry.quantity ? ` · ${entry.quantity.toLocaleString("ko-KR")}${item.unit ? item.unit : ""}` : ""}{canCorrect && entry.correctable && entry.id ? <button aria-label={`${entry.date} ${item.name} 매입 기록 정정`} className="min-h-11 rounded border px-2" onClick={() => { setEditing({ id: entry.id!, cost: String(entry.cost), revision: entry.correctionRevision || 0 }); setProductId(""); setProductChoices([]); setProductQuery(""); setReason(""); }} type="button">정정</button> : null}</span>;
                          })}
                          {detail?.key === item.key && detail.loading ? <span className="text-xs text-slate-500">품목 이력을 불러오는 중입니다.</span> : null}
                          {detail?.key === item.key && detail.hasMore ? <button className="maju-button-secondary min-h-11" onClick={() => void loadProductHistory(item, rows?.find((row) => `${row.product_catalog_id || row.line_key}|${row.supplier_name || ""}` === item.key)?.product_catalog_id || null, detail.page + 1)} type="button">이 품목 이력 더 보기</button> : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <h3 className="font-semibold">매입 기록 정정</h3>
        <p className="text-xs text-slate-600">엑셀 원본과 청구 금액은 유지합니다. 현재 매입가·판매가에 적용하려면 매입가 반영 화면에서 따로 저장·재계산해 주세요.</p>
        <label className="block text-sm">정정 단가(부가세 제외 원가) <input aria-label="정정 단가" className="maju-input w-full" min="0" max="1000000000" onChange={(event) => setEditing({ ...editing, cost: event.target.value })} step="0.01" type="number" value={editing.cost} /></label>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void findProducts(); }}><input aria-label="연결할 상품 검색" className="maju-input min-w-0 flex-1" onChange={(event) => { setProductQuery(event.target.value); setProductId(""); setProductChoices([]); }} placeholder="다른 상품으로 정정할 때 검색" value={productQuery} /><button className="maju-button-secondary" type="submit">상품 찾기</button></form>
        {productChoices.length ? <select aria-label="정정할 상품 선택" className="maju-input w-full" onChange={(event) => setProductId(event.target.value)} value={productId}><option value="">기존 상품 유지</option>{productChoices.map((product) => <option key={product.id} value={product.id}>{product.productCode} · {product.name} {product.spec || ""}</option>)}</select> : null}
        <label className="block text-sm">정정 사유 <input aria-label="정정 사유" className="maju-input w-full" maxLength={500} minLength={5} onChange={(event) => setReason(event.target.value)} placeholder="오입력 사유를 5자 이상 적어 주세요" value={reason} /></label>
        <div className="flex gap-2"><button className="maju-button-primary min-h-11" disabled={saving || !editing.cost || reason.trim().length < 5} onClick={() => void saveCorrection()} type="button">{saving ? "저장 중" : "정정 저장"}</button><button className="maju-button-secondary min-h-11" onClick={() => setEditing(null)} type="button">취소</button></div>
      </div> : null}
      {hasMore && rows?.length && !error ? <button className="maju-button-secondary min-h-11" disabled={loading} onClick={() => setPage((value) => value + 1)} type="button">{loading ? "불러오는 중" : "더 보기"}</button> : null}
    </section>
  );
}
