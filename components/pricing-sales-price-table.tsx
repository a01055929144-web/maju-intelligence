"use client";
import { useMemo, useState } from "react";
import type { PriceItem, PriceState } from "@/domains/pricing/price-rules";
import type { MarginTreeNode } from "@/domains/pricing/margin-tree";
import { categoryParts, inFolder } from "@/domains/pricing/margin-tree";
import type { PricingBulkCommand, PricingCommand } from "@/application/pricing/manage-price-sheets";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { marginSource } from "./pricing-margin-group-options";
import { isLoss, isLowProfit, splitHidden } from "@/domains/pricing/price-health";
import { MoneyInput } from "./money-input";

// CC-30a: 판매가 탭의 표 하나. 마진 칸·판매가 칸을 눌러 바로 고친다(저장 = 즉시 판매가 반영은 부모의 run이 한다).
// 출처 배지는 4종 중 이 화면에서 나오는 둘: `마진`(기본·분류·상품 — 작은 글씨로 어느 것인지) · `고정`. (`매장`·`행사`는 해당 탭에서.)
const source = (item: PriceItem, state: PriceState) => {
  const s = marginSource(item, state);
  if (s.kind === "direct") return { badge: "고정", detail: "마진 없이 정한 가격", tone: "bg-slate-900 text-white" };
  const detail = s.kind === "default" ? "기본" : s.kind === "item" ? "상품" : `분류 ${s.margin}%`;
  return { badge: "마진", detail, tone: "bg-emerald-100 text-emerald-800", title: `${detail}${s.margin !== null ? ` ${s.margin}%` : ""} → ${item.price.toLocaleString()}원` };
};

export function PricingSalesPriceTable({ items, state, tree, folder, onFolder, busy, run, folderTools }: {
  items: PriceItem[]; state: PriceState; tree: MarginTreeNode[]; folder: string | null; onFolder: (path: string | null) => void;
  busy: boolean; run: (commands: Array<PricingCommand | PricingBulkCommand>, done: string, apply?: boolean) => Promise<void>; folderTools: React.ReactNode;
}) {
  const [chip, setChip] = useState<"changed" | "fixed" | "loss" | "low" | "hidden" | null>(null);
  // CC-40: 숨긴(비활성) 상품은 기본 목록·개수·손해 경고·일괄 대상에서 뺀다. `숨긴 상품 N` 칩에서만 본다.
  const { visible: activeItems, hidden: hiddenAll } = useMemo(() => splitHidden(items), [items]);
  const hiddenItems = useMemo(() => hiddenAll.filter((item) => inFolder(item.category, folder)), [hiddenAll, folder]);
  const inScope = useMemo(() => activeItems.filter((item) => inFolder(item.category, folder)), [activeItems, folder]);
  // 바뀐 상품 = 매입가가 마지막 반영 때와 달라진 상품, 고정 가격 = 마진 없이 가격을 정한 상품.
  const changedItems = useMemo(() => inScope.filter((i) => i.appliedCost !== null && i.appliedCost !== i.cost), [inScope]);
  const fixedItems = useMemo(() => inScope.filter((i) => i.directPrice !== null), [inScope]);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // CC-30a: 줄 선택 → 마진 일괄 변경·고정 해제(서버는 한 번에 300개까지)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true); // P5: 분류 트리 240px, 접으면 표가 전체 너비
  const [bulkMargin, setBulkMargin] = useState("");
  const lossItems = useMemo(() => inScope.filter(isLoss), [inScope]);
  const lowItems = useMemo(() => inScope.filter((i) => isLowProfit(i, state.defaultMargin)), [inScope, state.defaultMargin]);
  const rows = chip === "changed" ? changedItems : chip === "fixed" ? fixedItems : chip === "loss" ? lossItems : chip === "low" ? lowItems : chip === "hidden" ? hiddenItems : inScope;
  const columns: CommonTableColumn<PriceItem>[] = [
    { key: "name", label: "상품", value: (i) => i.name, sortable: true, searchable: true, weight: 3, render: (i) => <span className="font-semibold">{i.name}{!i.active ? <span className="text-xs text-slate-400"> (비활성)</span> : null}</span> },
    { key: "category", label: "분류", value: (i) => i.category || "미분류", sortable: true, searchable: true, priority: 3 },
    { key: "cost", label: "매입가", value: (i) => i.cost, align: "right", sortable: true, priority: 2, width: 96, render: (i) => `${i.cost.toLocaleString()}원` },
    { key: "margin", label: "마진", value: (i) => marginSource(i, state).margin, align: "right", sortable: true, width: 104, render: (i) => {
      const s = marginSource(i, state);
      return <input aria-label={`${i.name} 마진율`} className="h-8 w-16 rounded border border-slate-300 px-1.5 text-right text-sm disabled:bg-slate-100" defaultValue={i.itemMargin ?? ""} disabled={busy || s.kind === "direct" || chip === "hidden"} inputMode="decimal" key={`m-${i.id}-${i.itemMargin}-${i.directPrice}`}
        onBlur={(e) => {
          const raw = e.currentTarget.value.trim();
          if (raw === String(i.itemMargin ?? "")) return;
          const margin = raw === "" ? null : Number(raw);
          if (margin !== null && (!Number.isFinite(margin) || margin < 0 || margin > 1000)) { e.currentTarget.value = String(i.itemMargin ?? ""); return; }
          void run([{ action: "item-margin", productId: i.id, margin }], `${i.name} 마진을 ${margin === null ? "상속(분류·기본)으로 되돌렸습니다" : `${margin}%로 바꿨습니다`}.`);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = String(i.itemMargin ?? ""); e.currentTarget.blur(); } }}
        placeholder={s.margin !== null ? String(s.margin) : "-"} /> ;
    } },
    { key: "price", label: "판매가", value: (i) => i.price, align: "right", sortable: true, width: 120, render: (i) => (
      <MoneyInput ariaLabel={`${i.name} 판매가`} className="h-8 w-24 rounded border border-slate-300 px-1.5 text-right text-sm font-bold" disabled={busy || chip === "hidden"} key={`p-${i.id}-${i.price}-${i.directPrice}`} value={i.price}
        onCommit={(price) => {
          if (price === null || price < 0) return; // 비우거나 음수면 원래 값 유지
          // 판매가를 직접 넣으면 마진이 아니라 고정 가격이 된다 — 매입가가 바뀌어도 안 따라가니 한 번 확인.
          if (!window.confirm(`${i.name}: 이 상품은 매입가가 바뀌어도 ${price.toLocaleString()}원으로 고정됩니다.\n마진으로 계산하려면 취소하고 마진 칸에 넣으세요.`)) return;
          void run([{ action: "direct", productId: i.id, price }], `${i.name} 판매가를 ${price.toLocaleString()}원으로 고정했습니다.`);
        }} />
    ) },
    { key: "profit", label: "이익", value: (i) => i.price - i.cost, align: "right", sortable: true, priority: 2, width: 100, render: (i) => <span className={i.price - i.cost <= 0 ? "font-bold text-rose-700" : ""}>{(i.price - i.cost).toLocaleString()}원</span> },
    { key: "source", label: "출처", value: (i) => { const s = source(i, state); return `${s.badge} ${s.detail}`; }, priority: 3, width: 180, render: (i) => {
      const s = source(i, state);
      return <span className="inline-flex items-center gap-1" title={s.title}><span className={`rounded px-1.5 py-0.5 text-xs font-bold ${s.tone}`}>{s.badge}</span><span className="text-xs text-slate-500">{s.detail}</span>
        {i.directPrice !== null ? <button className="text-xs text-teal-700 underline" disabled={busy || chip === "hidden"} onClick={() => void run([{ action: "direct", productId: i.id, price: null }], `${i.name} 고정 가격을 풀고 마진으로 계산합니다.`)} type="button">마진으로 계산</button> : null}</span>;
    } },
  ];
  const ids = Array.from(selected);
  const tooMany = ids.length > 300;
  const bulk = async (command: PricingBulkCommand, done: string) => { await run([command], done); setSelected(new Set()); setBulkOpen(false); setBulkMargin(""); };
  const marginValue = Number(bulkMargin);
  const marginOk = bulkMargin.trim() !== "" && Number.isFinite(marginValue) && marginValue >= 0 && marginValue <= 1000;
  return <div className={`grid gap-4 lg:items-start ${treeOpen ? "lg:grid-cols-[240px_minmax(0,1fr)]" : "lg:grid-cols-[auto_minmax(0,1fr)]"}`}>
    {!treeOpen ? <button aria-expanded={false} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700" onClick={() => setTreeOpen(true)} type="button">분류 펼치기 ▸</button> : null}
    <aside aria-label="분류" className={`space-y-1 rounded-xl border border-slate-200 bg-white p-2 ${treeOpen ? "" : "hidden"}`}>
      <button aria-expanded className="h-7 w-full text-right text-xs font-bold text-slate-500" onClick={() => setTreeOpen(false)} type="button">◂ 분류 접기</button>
      <button aria-pressed={folder === null} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold ${folder === null ? "bg-teal-50 text-teal-800" : "hover:bg-slate-50"}`} onClick={() => onFolder(null)} type="button"><span>전체</span><span className="text-xs text-slate-500">{items.length}</span></button>
      {tree.map((node) => <button aria-pressed={folder === node.path} className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg py-1.5 pr-3 text-left text-sm ${folder === node.path ? "bg-teal-50 text-teal-800" : "hover:bg-slate-50"}`} key={node.path} onClick={() => onFolder(node.path)} style={{ paddingLeft: 12 + node.depth * 12 }} type="button">
        <span className={`truncate ${node.depth === 0 ? "font-bold" : ""}`}>{node.name}</span><span className="shrink-0 text-xs text-slate-500">{node.badge} · {node.count}</span></button>)}
      {folder ? <div className="border-t pt-2">{folderTools}</div> : null}
    </aside>
    <div className="min-w-0 space-y-2">
      {ids.length ? <div aria-label="일괄 변경" className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm" role="group">
        <b>{ids.length}개 선택</b>
        {bulkOpen ? <>
          <input aria-label="일괄 마진율" className="h-8 w-16 rounded border border-slate-300 px-1.5 text-right" inputMode="decimal" onChange={(e) => setBulkMargin(e.target.value)} placeholder="12" value={bulkMargin} />%
          <button className="maju-button-primary min-h-[36px] px-3" disabled={busy || tooMany || !marginOk} onClick={() => void bulk({ action: "bulk-margin", productIds: ids, margin: marginValue }, `${ids.length}개 상품의 마진을 ${marginValue}%로 바꿨습니다.`)} type="button">적용</button>
          <button className="min-h-[36px] px-2 text-xs font-bold text-slate-600 underline" onClick={() => setBulkOpen(false)} type="button">닫기</button>
        </> : <button className="maju-button-primary min-h-[36px] px-3" disabled={busy || tooMany} onClick={() => setBulkOpen(true)} type="button">마진 일괄 변경</button>}
        <button className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 font-bold" disabled={busy || tooMany} onClick={() => void bulk({ action: "bulk-direct", productIds: ids, price: null }, `${ids.length}개 상품의 고정 가격을 풀고 마진으로 계산합니다.`)} type="button">고정 해제</button>
        <button className="min-h-[36px] px-2 text-xs font-bold text-slate-600 underline" onClick={() => { setSelected(new Set()); setBulkOpen(false); }} type="button">선택 해제</button>
        {tooMany ? <span className="text-xs font-bold text-rose-700">한 번에 300개까지 바꿀 수 있습니다.</span> : null}
      </div> : <button className="self-start text-xs font-bold text-teal-700 underline" disabled={!rows.length} onClick={() => setSelected(new Set(rows.slice(0, 300).map((i) => i.id)))} type="button">이 목록 선택{rows.length > 300 ? " (앞 300개)" : ""}</button>}
      <div aria-label="필터" className="flex flex-wrap gap-1.5" role="group">
        {([["changed", "바뀐 상품", changedItems.length, ""], ["fixed", "고정 가격", fixedItems.length, ""], ["loss", "손해", lossItems.length, "rose"], ["low", "이익 낮음", lowItems.length, "amber"], ["hidden", "숨긴 상품", hiddenItems.length, "gray"]] as const).filter(([id, , n]) => n > 0 || id === chip).map(([id, label, n, tone]) =>
          <button aria-pressed={chip === id} className={`min-h-[32px] rounded-full border px-3 text-xs font-bold ${chip === id ? "border-teal-700 bg-teal-700 text-white" : tone === "rose" ? "border-rose-300 bg-rose-50 text-rose-800" : tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-900" : tone === "gray" ? "border-slate-300 bg-slate-100 text-slate-500" : "border-slate-300 bg-white text-slate-600"}`} key={id} onClick={() => setChip(chip === id ? null : id)} type="button">{label} {n}</button>)}
      </div>
      {chip === "hidden" ? <p className="text-sm text-slate-600" role="status">숨긴 상품은 가격·문서·주문 화면에 나오지 않습니다. 다시 판매하려면 <a className="font-bold text-teal-700 underline" href="/revenue/products">상품관리</a>에서 되살려 주세요.</p> : null}
      {lossItems.length && chip !== "loss" ? <p className="text-sm font-bold text-rose-700"><button className="underline" onClick={() => setChip("loss")} type="button">손해 {lossItems.length}개</button> — 이익이 0원 이하인 상품입니다.</p> : null}
      <CommonDataTable selection={{ selected, onChange: setSelected }} categoryKey={(i) => { const parts = categoryParts(i.category || ""); return { major: parts[0], minor: parts[1] }; }} columns={columns} emptyMessage="해당 상품이 없습니다. 매입가를 먼저 올려 주세요." filename="판매가.csv" rowKey={(i) => i.id} rows={rows} settingsKey="pricing-sales-price-v2" />
    </div>
  </div>;
}
