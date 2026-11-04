"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { summarizePurchaseHistory, type PurchaseHistoryRow } from "@/domains/pricing/purchase-receipt";

const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

/** 11/4: 매일 올린 매입 엑셀의 품목별 단가 변동·수량을 한눈에 봅니다. */
export function PurchaseHistoryPanel({ companyId, refreshKey }: { readonly companyId: string; readonly refreshKey: number }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<PurchaseHistoryRow[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [open, setOpen] = useState<string>("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/price-sheets/receipts?companyId=${encodeURIComponent(companyId)}&days=${days}`, { cache: "no-store" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { rows?: PurchaseHistoryRow[]; message?: string } | null;
    if (!response?.ok || !payload?.rows) { setRows([]); setError(payload?.message || "매입 이력을 불러오지 못했습니다."); return; }
    setRows(payload.rows);
  }, [companyId, days]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const items = useMemo(() => summarizePurchaseHistory(rows || []).filter((item) => {
    if (onlyChanged && !item.changeRate) return false;
    if (search && !`${item.name} ${item.spec} ${item.supplier}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))) return false;
    return true;
  }), [onlyChanged, rows, search]);
  const dates = useMemo(() => new Set((rows || []).map((row) => row.receipt_date)).size, [rows]);
  const up = items.filter((item) => (item.changeRate || 0) > 0).length;
  const down = items.filter((item) => (item.changeRate || 0) < 0).length;

  return (
    <section className="maju-section-card min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">매입 이력</h2>
        <span className="text-xs font-semibold text-slate-500">{dates}일 · 품목 {items.length}개 · 인상 {up} · 인하 {down}</span>
        <select aria-label="기간" className="maju-input h-9" onChange={(event) => setDays(Number(event.target.value))} value={days}>
          <option value={7}>최근 7일</option><option value={30}>최근 30일</option><option value={90}>최근 90일</option><option value={365}>최근 1년</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><input checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} type="checkbox" />단가 바뀐 품목만</label>
        <input aria-label="이력 검색" className="maju-input h-9" onChange={(event) => setSearch(event.target.value)} placeholder="품목·매입처 검색" value={search} />
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {rows === null ? <p className="text-sm text-slate-500">불러오는 중입니다.</p> : !items.length ? <p className="text-sm text-slate-500">이 기간에 저장된 매입 기록이 없습니다. 엑셀을 올려 저장하면 날짜별로 쌓입니다.</p> : (
        <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">품목</th><th className="px-3 py-2">매입처</th><th className="px-3 py-2">최근 매입일</th><th className="px-3 py-2 text-right">최근 단가</th><th className="px-3 py-2 text-right">직전 단가</th><th className="px-3 py-2 text-right">변동</th><th className="px-3 py-2 text-right">기간 최저~최고</th><th className="px-3 py-2 text-right">기간 수량</th><th className="px-3 py-2 text-right">횟수</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Fragment key={item.key}>
                  <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen((current) => (current === item.key ? "" : item.key))}>
                    <td className="px-3 py-2 font-semibold">{item.name}<span className="ml-1 text-xs font-normal text-slate-500">{[item.spec, item.unit].filter(Boolean).join(" · ")}</span></td>
                    <td className="px-3 py-2 text-slate-600">{item.supplier || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{item.latestDate}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(item.latestCost)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.previousCost != null ? money(item.previousCost) : "-"}</td>
                    <td className={`px-3 py-2 text-right font-bold ${(item.changeRate || 0) > 0 ? "text-rose-600" : (item.changeRate || 0) < 0 ? "text-blue-600" : "text-slate-400"}`}>{item.changeRate ? `${item.changeRate > 0 ? "▲" : "▼"} ${Math.abs(item.changeRate)}%` : "-"}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.minCost === item.maxCost ? money(item.minCost) : `${money(item.minCost)} ~ ${money(item.maxCost)}`}</td>
                    <td className="px-3 py-2 text-right">{item.totalQuantity ? `${item.totalQuantity.toLocaleString("ko-KR")}${item.unit ? ` ${item.unit}` : ""}` : "-"}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.count}</td>
                  </tr>
                  {open === item.key ? (
                    <tr className="bg-slate-50/70">
                      <td className="px-3 py-2" colSpan={9}>
                        <div className="flex flex-wrap gap-1.5">
                          {item.entries.map((entry, index) => {
                            const prev = item.entries[index + 1];
                            const diff = prev ? entry.cost - prev.cost : 0;
                            return <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs" key={`${entry.date}-${index}`}>{entry.date.slice(5)} · <b>{money(entry.cost)}</b>{diff ? <span className={diff > 0 ? " text-rose-600" : " text-blue-600"}> {diff > 0 ? "+" : ""}{diff.toLocaleString("ko-KR")}</span> : null}{entry.quantity ? ` · ${entry.quantity.toLocaleString("ko-KR")}${item.unit ? item.unit : ""}` : ""}</span>;
                          })}
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
    </section>
  );
}
