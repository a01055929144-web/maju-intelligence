"use client";

import { aggregateFulfillment, type FulfillmentLine, type FulfillmentMode } from "@/domains/order/fulfillment";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { Button } from "./ui/button";
import { ErrorState, LoadingState } from "./ui/state";

type View = "summary" | "purchase" | "picking" | "loading" | "supplier";
const labels: Record<View, string> = { summary: "선주문 집계", purchase: "사입표", picking: "피킹표", loading: "상차표", supplier: "매입처 발주서" };
const modeLabel: Record<FulfillmentMode, string> = { inventory: "재고", purchase: "사입", market: "시세" };
const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

function download(dataUrl: string, filename: string) { const anchor = document.createElement("a"); anchor.href = dataUrl; anchor.download = filename; anchor.click(); }

export function OrderFulfillmentWorkspace({ companyId, preview = false }: { companyId: string; preview?: boolean }) {
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [items, setItems] = useState<FulfillmentLine[] | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("summary");
  const [supplier, setSupplier] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setError(""); setItems(null);
    const response = await fetch(`/api/orders/fulfillment?companyId=${encodeURIComponent(companyId)}&deliveryDate=${deliveryDate}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({})) as { items?: FulfillmentLine[]; message?: string };
    if (!response.ok) { setItems([]); setError(result.message || "출고 준비 자료를 불러오지 못했습니다."); return; }
    setItems(result.items || []);
  }, [companyId, deliveryDate]);
  useEffect(() => { void load(); }, [load]);
  const summary = useMemo(() => aggregateFulfillment(items || []), [items]);
  const suppliers = useMemo(() => Array.from(new Set((items || []).filter((line) => line.mode !== "inventory").map((line) => line.supplier))).sort((a, b) => a.localeCompare(b, "ko")), [items]);
  const supplierName = supplier || suppliers[0] || "";
  const supplierLines = (items || []).filter((line) => line.mode !== "inventory" && line.supplier === supplierName);

  async function dispatchAll() {
    const orderIds = Array.from(new Set((items || []).map((line) => line.orderId)));
    if (!orderIds.length || !window.confirm(`${orderIds.length}건을 출고 확정할까요? 전표·원장·재고가 함께 반영됩니다.`)) return;
    setDispatching(true); setError("");
    try {
      const response = await fetch("/api/orders/fulfillment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, orderIds, idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(result.message || "출고를 확정하지 못했습니다.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "출고를 확정하지 못했습니다."); }
    finally { setDispatching(false); }
  }

  async function saveImage() {
    if (!paperRef.current) return;
    try { const { toPng } = await import("html-to-image"); download(await toPng(paperRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 }), `${deliveryDate}-${labels[view]}.png`); }
    catch { setError("이미지를 만들지 못했습니다. PDF·인쇄를 사용해 주세요."); }
  }

  const summaryColumns: CommonTableColumn<(typeof summary)[number]>[] = [
    { key: "date", label: "배송일", value: (row) => row.deliveryDate }, { key: "territory", label: "권역", value: (row) => row.territory },
    { key: "vehicle", label: "호차", value: (row) => row.vehicle }, { key: "mode", label: "처리", value: (row) => modeLabel[row.mode] },
    { key: "product", label: "품목", value: (row) => `${row.productName} ${row.specification}`.trim() },
    { key: "supplier", label: "매입처", value: (row) => row.mode === "inventory" ? "-" : row.supplier },
    { key: "stores", label: "매장", align: "right", value: (row) => row.storeCount },
    { key: "quantity", label: "합계 수량", align: "right", total: true, value: (row) => row.quantity, render: (row) => `${row.quantity.toLocaleString("ko-KR")} ${row.unit}` },
  ];

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div className="flex flex-wrap items-end gap-2"><label className="text-sm font-bold text-slate-700">배송일<input className="maju-input mt-1 block h-11" onChange={(event) => setDeliveryDate(event.target.value)} type="date" value={deliveryDate} /></label>
        <Button className="min-h-11" onClick={() => void load()} variant="outline">새로고침</Button></div>
      <div className="flex flex-wrap gap-2"><Button disabled={preview || dispatching || !items?.length} onClick={() => void dispatchAll()}>{dispatching ? "확정 중..." : "출고 확정"}</Button><a className="maju-button-secondary min-h-11" href={`/orders?companyId=${encodeURIComponent(companyId)}`}>주문 확인으로</a></div>
    </div>
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">출고 확정하면 작성중 전표·원장·재고가 한 번에 반영됩니다. 발주서 자동 발송은 하지 않습니다.{preview ? " 관리자 미리보기에서는 출고를 확정할 수 없습니다." : ""}</p>
    <div className="flex gap-2 overflow-x-auto pb-1 print:hidden" role="tablist">{(Object.keys(labels) as View[]).map((key) => <button aria-selected={view === key} className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-bold ${view === key ? "bg-slate-900 text-white" : "border bg-white text-slate-700"}`} key={key} onClick={() => setView(key)} role="tab" type="button">{labels[key]}</button>)}</div>
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : items === null ? <LoadingState label="출고 준비 자료를 불러오는 중입니다..." /> : !items.length ? <div className="maju-section-card p-6 text-center"><p className="font-bold">이 배송일에 접수 완료된 주문이 없습니다.</p><p className="mt-1 text-sm text-slate-600">주문 확인에서 접수한 뒤 다시 확인해 주세요.</p></div> : view === "summary" ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3">{(["inventory", "purchase", "market"] as FulfillmentMode[]).map((mode) => <div className="maju-stat-card" key={mode}><p className="maju-muted-label">{modeLabel[mode]}</p><p className="text-2xl font-black">{summary.filter((row) => row.mode === mode).length.toLocaleString("ko-KR")}품목</p></div>)}</div><CommonDataTable columns={summaryColumns} emptyMessage="집계할 주문이 없습니다." filename={`${deliveryDate}-선주문-집계.csv`} rowKey={(row) => row.key} rows={summary} settingsKey={`fulfillment:${companyId}`} /></div> : <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2 print:hidden">{view === "supplier" ? <label className="text-sm font-bold">매입처<select className="maju-input ml-2 h-11" onChange={(event) => setSupplier(event.target.value)} value={supplierName}>{suppliers.map((name) => <option key={name}>{name}</option>)}</select></label> : <span />}
        <div className="flex gap-2"><Button onClick={() => void saveImage()} variant="outline">이미지 저장</Button><Button onClick={() => window.print()}>PDF·인쇄</Button></div></div>
      <div className="mx-auto min-h-[260mm] max-w-[210mm] bg-white p-8 text-slate-950 shadow print:min-h-0 print:max-w-none print:p-0 print:shadow-none" ref={paperRef}>
        <header className="mb-5 border-b-2 border-slate-900 pb-3"><h2 className="text-2xl font-black">{labels[view]}</h2><p className="mt-1 text-sm">배송일 {deliveryDate}{view === "supplier" ? ` · ${supplierName}` : ""}</p></header>
        {view === "purchase" ? <PrintTable headers={["매입처", "품목", "규격", "필요 수량", "예상 단가", "실제 단가", "메모"]} rows={summary.filter((row) => row.mode !== "inventory").map((row) => [row.supplier, row.productName, row.specification || "-", `${row.quantity} ${row.unit}`, "", "", ""])} /> : null}
        {view === "picking" ? <PrintTable headers={["확인", "보관 위치", "품목", "규격", "총수량", "처리"]} rows={summary.map((row) => ["□", "미등록", row.productName, row.specification || "-", `${row.quantity} ${row.unit}`, modeLabel[row.mode]])} /> : null}
        {view === "loading" ? <PrintTable headers={["확인", "호차", "정류장", "매장", "품목·수량", "보관", "메모 1", "메모 2"]} rows={(items || []).sort((a, b) => `${a.vehicle}|${a.customerName}`.localeCompare(`${b.vehicle}|${b.customerName}`, "ko")).map((line, index) => ["□", line.vehicle, String(index + 1), line.customerName, `${line.productName} ${line.quantity}${line.unit}`, line.storageLocation || "미등록", line.requestMemo, ""])} /> : null}
        {view === "supplier" ? <PrintTable headers={["품목", "규격", "수량", "단위", "납품일", "비고"]} rows={supplierLines.map((line) => [line.productName, line.specification || "-", String(line.quantity), line.unit, line.deliveryDate, line.requestMemo])} /> : null}
        <p className="mt-5 text-xs text-slate-500">이 문서는 읽기 전용 준비 자료입니다. 발주는 카카오톡 첨부·공유 등 사람이 직접 전달합니다.</p>
      </div>
    </div>}
  </section>;
}

function PrintTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <table className="w-full border-collapse text-xs"><thead><tr>{headers.map((header) => <th className="border border-slate-700 bg-slate-100 p-2 text-left" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td className="h-9 border border-slate-500 p-2 align-top" key={cell}>{value || " "}</td>)}</tr>)}</tbody></table>;
}
