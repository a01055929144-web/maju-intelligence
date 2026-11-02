"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { ExcelHeaderMappingPreview } from "@/components/excel-mapping-preview";
import { matchCostImportRow, parseCostImportRows, type CostImportRow, type CostProduct } from "@/domains/pricing/purchase-cost";
import { buildCatalogPreview, type CatalogMapping } from "@/domains/product/catalog-import";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { DocumentDraft } from "@/domains/pricing/document";
import { documentRequest } from "@/lib/pricing/document-client";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

type Candidate = { cost: number; supplierProductId?: string; method: "직접" | "엑셀"; source: string };
type ImportField = keyof CostImportRow;
const fields: Array<{ key: ImportField; label: string; aliases: string[]; required?: boolean }> = [
  { key: "code", label: "ERP 코드", aliases: ["기본코드", "상품코드", "품목코드", "ERP코드"] },
  { key: "name", label: "품목", aliases: ["상품명", "품목명", "상 품 명"], required: true },
  { key: "spec", label: "규격", aliases: ["규격", "규 격"] },
  { key: "unit", label: "단위", aliases: ["단위"] },
  { key: "supplier", label: "매입처", aliases: ["매입처", "유통사", "공급처"] },
  { key: "cost", label: "매입가", aliases: ["매입가", "단가", "원가"], required: true },
];
const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function PurchaseCostWorkspace({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<CostProduct[]>([]);
  const [pricing, setPricing] = useState<PriceState | null>(null);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [candidates, setCandidates] = useState<Record<string, Candidate>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [unmatched, setUnmatched] = useState<CostImportRow[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [tab, setTab] = useState("변동 있음");
  const [supplier, setSupplier] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<{ changes: Array<{ productId: string; supplierProductId?: string; expectedCost: number; cost: number }>; batchId?: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useUnsavedChangesWarning(Object.keys(candidates).length > 0 || rows.length > 0);

  const load = useCallback(async () => {
    setCatalogReady(false);
    const q = new URLSearchParams({ companyId });
    const [catalogResponse, pricingResponse] = await Promise.all([
      fetch(`/api/price-sheets/costs?${q}`, { cache: "no-store" }),
      fetch(`/api/price-sheets?${q}`, { cache: "no-store" }),
    ]);
    const catalog = await catalogResponse.json();
    const price = await pricingResponse.json();
    if (!catalogResponse.ok || !pricingResponse.ok) throw new Error(catalog.message || price.message || "매입가를 불러오지 못했습니다.");
    setProducts(catalog.products);
    setPricing(price);
    setCatalogReady(true);
    try {
      const all: DocumentDraft[] = [];
      for (let page = 1; page <= 200; page++) {
        const result = await documentRequest<{ items: DocumentDraft[]; total: number }>(companyId, "list", { page, search: "" });
        all.push(...result.result.items);
        if (all.length >= result.result.total) break;
      }
      setDocuments(all);
    } catch { setMessage("문서 영향은 지금 조회하지 못했습니다. 저장 전 문서 목록을 확인해 주세요."); }
  }, [companyId]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "매입가를 불러오지 못했습니다.")); }, [load]);

  const unique = useMemo(() => Array.from(new Set(products.map((product) => product.id))).map((id) => {
    const linked = products.filter((product) => product.id === id);
    return linked.length === 1 ? linked[0] : { ...linked[0], supplierProductId: undefined, supplierName: "여러 매입처" };
  }), [products]);
  const usedBy = useMemo(() => {
    const map = new Map<string, DocumentDraft[]>();
    for (const document of documents) for (const line of document.content.lines) {
      const list = map.get(line.productId) || [];
      if (!list.some((item) => item.id === document.id)) list.push(document);
      map.set(line.productId, list);
    }
    return map;
  }, [documents]);
  const affected = useMemo(() => documents.map((document) => ({ document, count: document.content.lines.filter((line) => candidates[line.productId]?.cost !== undefined).length })).filter((entry) => entry.count > 0), [candidates, documents]);
  const displayed = unique.filter((product) => {
    const candidate = candidates[product.id];
    if (supplier && !products.some((entry) => entry.id === product.id && entry.supplierName === supplier)) return false;
    if (method && candidate?.method !== method) return false;
    if (search && !`${product.code} ${product.name} ${product.spec}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))) return false;
    if (tab === "신규") return false;
    if (tab === "변동 있음") return candidate != null && candidate.cost !== product.cost;
    if (tab === "인상") return candidate != null && candidate.cost > product.cost;
    if (tab === "인하") return candidate != null && candidate.cost < product.cost;
    return true;
  });

  const edit = useCallback((product: CostProduct, raw: string) => {
    if (raw === "") { setCandidates((current) => { const next = { ...current }; delete next[product.id]; return next; }); setSelected((current) => current.filter((id) => id !== product.id)); return; }
    const cost = Number(raw);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000_000) return;
    const selectedSupplier = supplier ? products.find((entry) => entry.id === product.id && entry.supplierName === supplier) : product;
    setCandidates((current) => ({ ...current, [product.id]: { cost, supplierProductId: selectedSupplier?.supplierProductId, method: "직접", source: "직접 입력" } }));
    setSelected((current) => current.includes(product.id) ? current : [...current, product.id]);
  }, [products, supplier]);

  async function readFile(file: File) {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = file.name.toLocaleLowerCase().endsWith(".csv")
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" })
        : XLSX.read(buffer, { type: "array", cellDates: true });
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
      if (!parsed.length) throw new Error("파일에 품목이 없습니다.");
      const columns = Object.keys(parsed[0]);
      setRows(parsed);
      setHeaders(columns);
      setMapping(Object.fromEntries(fields.map((field) => [field.key, columns.find((column) => field.aliases.some((alias) => alias.replaceAll(" ", "") === column.replaceAll(" ", ""))) || ""])));
      setFileName(file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "엑셀을 읽지 못했습니다."); }
  }

  function applyFile() {
    if (!catalogReady) { setError("상품 목록을 불러온 뒤 다시 시도해 주세요."); return; }
    try {
      const parsed = parseCostImportRows(rows, mapping as Record<ImportField, string>);
      const next: Record<string, Candidate> = {};
      const missing: CostImportRow[] = [];
      for (const row of parsed) {
        const matched = matchCostImportRow(row, products);
        if (matched && (!row.supplier || matched.supplierProductId)) next[matched.id] = { cost: row.cost, supplierProductId: matched.supplierProductId, method: "엑셀", source: fileName };
        else missing.push(row);
      }
      setCandidates((current) => ({ ...current, ...next }));
      setSelected((current) => Array.from(new Set([...current, ...Object.keys(next)])));
      setUnmatched(missing);
      setRows([]);
      setMessage(`변경 후보 ${Object.keys(next).length}개 · 새 상품/확인 필요 ${missing.length}개. 저장 전에는 반영되지 않습니다.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "열 맞추기를 확인해 주세요."); }
  }

  async function createNewProducts() {
    if (!unmatched.length) return;
    setBusy(true); setError("");
    let savedCount = 0;
    let createdCount = 0;
    try {
      const groups = new Map<string, CostImportRow[]>();
      for (const row of unmatched) {
        const name = row.supplier || newSupplier.trim();
        if (!name) throw new Error("새 상품의 매입처명을 입력해 주세요.");
        const list = groups.get(name) || [];
        list.push(row); groups.set(name, list);
      }
      const catalogMapping: CatalogMapping = { productName: "상품명", spec: "규격", unit: "단위", cost: "매입가", productCode: "기본코드" };
      for (const [supplierName, items] of Array.from(groups.entries())) {
        const raw = items.map((row) => ({ 상품명: row.name, 규격: row.spec, 단위: row.unit, 매입가: row.cost, 기본코드: row.code }));
        const preview = buildCatalogPreview(raw, catalogMapping, supplierName);
        const response = await fetch("/api/product-catalog/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-import", companyId, fileName: fileName || "매입가 반영", supplierName, mapping: catalogMapping, products: preview.products, excludedCount: preview.excludedCount, warnings: preview.warnings }) });
        const saved = await response.json();
        if (!response.ok) throw new Error(saved.message || "매입처 상품 업로드에 실패했습니다.");
        const ids = (saved.unmatchedSupplierProductIds || []) as string[];
        savedCount += items.length;
        for (let offset = 0; offset < ids.length; offset += 25) {
          const createdResponse = await fetch("/api/product-catalog/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-standards", companyId, supplierProductIds: ids.slice(offset, offset + 25) }) });
          const created = await createdResponse.json();
          if (!createdResponse.ok) throw new Error(created.message || "마스터 상품 생성에 실패했습니다.");
          createdCount += Number(created.createdCount || 0);
        }
      }
      await command("recalculate");
      setUnmatched([]); await load();
      setMessage(`매입처 상품 ${savedCount}개 저장 · 마스터 상품 ${createdCount}개 생성·연결 · 판매가 재계산 완료`);
    } catch (cause) { setError(`매입처 상품 ${savedCount}개 저장 · 마스터 상품 ${createdCount}개 생성 완료. 일부 행은 매입처 상품만 저장됐을 수 있으니 상품관리에서 확인해 주세요. ${cause instanceof Error ? cause.message : "새 상품을 만들지 못했습니다."}`); }
    finally { setBusy(false); }
  }

  async function command(action: "recalculate" | "restore", batchId?: string) {
    const response = await fetch(`/api/price-sheets?companyId=${encodeURIComponent(companyId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, batchId }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "재계산에 실패했습니다.");
    setPricing(payload);
    return payload as PriceState;
  }

  async function save() {
    const changes = selected.filter((id) => candidates[id] && candidates[id].cost !== unique.find((item) => item.id === id)?.cost).map((id) => {
      const product = unique.find((item) => item.id === id)!;
      return { productId: id, supplierProductId: candidates[id].supplierProductId, expectedCost: product.cost, cost: candidates[id].cost, fileName: candidates[id].source };
    });
    if (!changes.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/price-sheets/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, changes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "매입가를 저장하지 못했습니다.");
      const previousBatch = pricing?.lastBatch;
      let batchId: string | undefined;
      try { const updated = await command("recalculate"); if (updated.lastBatch && updated.lastBatch !== previousBatch) batchId = updated.lastBatch; }
      catch (cause) { setError(`매입가 ${changes.length}건은 저장됐지만 판매가 재계산은 실패했습니다. 마진 그룹에서 다시 계산해 주세요. ${cause instanceof Error ? cause.message : ""}`); }
      setUndo({ changes: changes.map((change) => ({ productId: change.productId, supplierProductId: change.supplierProductId, expectedCost: change.cost, cost: change.expectedCost })), batchId });
      setCandidates({}); setSelected([]); await load();
      setMessage(`매입가 ${changes.length}건 저장${batchId ? " · 판매가 재계산 완료" : " · 재계산 상태 확인 필요"}. 이 화면에서 직전 저장을 되돌릴 수 있습니다.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); await load().catch(() => undefined); }
    finally { setBusy(false); }
  }

  async function restore() {
    if (!undo || !window.confirm("직전 매입가 변경과 판매가 계산을 되돌릴까요?")) return;
    setBusy(true); setError("");
    try {
      if (undo.batchId) await command("restore", undo.batchId);
      const response = await fetch("/api/price-sheets/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, changes: undo.changes.map((change) => ({ ...change, fileName: "직전 저장 복구" })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "매입가 복구에 실패했습니다.");
      setUndo(null); await load(); setMessage("직전 매입가 변경을 복구했습니다.");
    } catch (cause) { setError(`복구가 끝나지 않았습니다. 가격을 확인해 주세요. ${cause instanceof Error ? cause.message : ""}`); }
    finally { setBusy(false); }
  }

  function exportTemplate() {
    const csv = ["ERP 코드,품목,규격,단위,매입처,매입가", ...unique.map((product) => [product.code, product.name, product.spec, product.unit, product.supplierName || "", product.cost].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "매입가_엑셀_양식.csv"; link.click(); URL.revokeObjectURL(url);
  }

  const columns = useMemo<CommonTableColumn<CostProduct>[]>(() => [
    { key: "select", label: "선택", value: (row) => selected.includes(row.id) ? "선택" : "", render: (row) => <input aria-label={`${row.name} 선택`} checked={selected.includes(row.id)} disabled={!candidates[row.id] || busy} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} type="checkbox" /> },
    { key: "name", label: "품목", value: (row) => row.name, render: (row) => <>{row.name}<small className="block text-slate-500">{row.code}</small></> },
    { key: "spec", label: "규격", value: (row) => row.spec },
    { key: "unit", label: "단위", value: (row) => row.unit },
    { key: "supplier", label: "매입처", value: (row) => row.supplierName || "-" },
    { key: "current", label: "현재 매입가", align: "right", total: true, value: (row) => row.cost, render: (row) => money(row.cost) },
    { key: "date", label: "적용일", value: () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) },
    { key: "next", label: "변경 후", align: "right", total: true, value: (row) => candidates[row.id]?.cost ?? row.cost, render: (row) => <input aria-label={`${row.name} 변경 후 매입가`} className="maju-input w-28" disabled={busy} min="0" max="1000000000" step="0.01" type="number" value={candidates[row.id]?.cost ?? ""} placeholder={String(row.cost)} onChange={(event) => edit(row, event.target.value)} /> },
    { key: "delta", label: "변동", value: (row) => candidates[row.id] ? (row.cost ? Math.round((candidates[row.id].cost / row.cost - 1) * 1000) / 10 : 0) : 0, render: (row) => candidates[row.id] ? `${candidates[row.id].cost >= row.cost ? "▲" : "▼"} ${row.cost ? Math.abs(Math.round((candidates[row.id].cost / row.cost - 1) * 1000) / 10) : "신규"}%` : "-" },
    { key: "method", label: "바꾼 방법·근거", value: (row) => candidates[row.id] ? `${candidates[row.id].method} · ${candidates[row.id].source}` : "-" },
    { key: "used", label: "쓰는 곳", value: (row) => (usedBy.get(row.id) || []).map((doc) => doc.content.title).join(", ") || "-", render: (row) => (usedBy.get(row.id) || []).length ? <Link className="text-teal-700 underline" href="/revenue/pricing/documents">{(usedBy.get(row.id) || []).length}개 문서</Link> : "-" },
  ], [busy, candidates, edit, selected, usedBy]);

  return <div className="space-y-4" aria-busy={busy}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">매입가 반영</h1><p className="text-sm text-slate-600">ERP 미연동 · 엑셀 또는 직접 입력으로 매입가를 확인합니다.</p></div><div className="flex flex-wrap gap-2"><button className="maju-button-secondary" onClick={exportTemplate} type="button">엑셀 양식</button><button className="maju-button-secondary" onClick={() => fileInput.current?.click()} type="button">엑셀 올리기</button><button className="maju-button-primary" disabled={busy || !selected.length} onClick={() => void save()} type="button">저장 ({selected.length}건)</button></div></header>
    <input accept=".xls,.xlsx,.csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} ref={fileInput} type="file" />
    {error ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-700">{error} <button className="underline" onClick={() => void load()} type="button">다시 시도</button></p> : null}
    {message ? <p role="status" className="rounded border border-teal-200 bg-teal-50 p-3">{message}</p> : null}
    {rows.length ? <section className="maju-section-card space-y-3 p-3"><ExcelHeaderMappingPreview fieldMap={mapping} fields={fields} headers={headers} onMap={setMapping} rows={rows as Array<Record<string, string | number | boolean | null | undefined>>} /><div className="flex gap-2"><button className="maju-button-primary" disabled={!catalogReady} onClick={applyFile} type="button">열 맞추기 적용</button><button className="maju-button-secondary" onClick={() => setRows([])} type="button">취소</button></div></section> : null}
    <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">영향받는 문서</h2><p className="text-sm text-slate-600">확정 전에는 문서와 가격이 바뀌지 않습니다. 저장 후 기존 확정 문서는 다시 계산 필요로 확인해 주세요.</p><div className="flex flex-wrap gap-2">{affected.length ? affected.map(({ document, count }) => <Link className="rounded border p-2 text-sm" href="/revenue/pricing/documents" key={document.id}>{document.content.kind === "sheet" ? "단가표" : "견적서"} · {document.content.title} · {count}개 품목</Link>) : <span className="text-sm text-slate-500">변경 후보와 연결된 문서가 없습니다.</span>}</div></section>
    <div className="flex flex-wrap gap-2">{["변동 있음", "인상", "인하", "신규", "전체"].map((name) => <button aria-pressed={tab === name} className={tab === name ? "maju-button-primary" : "maju-button-secondary"} key={name} onClick={() => setTab(name)} type="button">{name}{name === "신규" ? ` ${unmatched.length}` : ""}</button>)}<select aria-label="매입처" className="maju-input" onChange={(event) => setSupplier(event.target.value)} value={supplier}><option value="">매입처 전체</option>{Array.from(new Set(products.map((product) => product.supplierName).filter((name): name is string => Boolean(name)))).map((name) => <option key={name} value={name}>{name}</option>)}</select><select aria-label="바꾼 방법" className="maju-input" onChange={(event) => setMethod(event.target.value)} value={method}><option value="">바꾼 방법 전체</option><option>직접</option><option>엑셀</option><option disabled>전표</option></select><input aria-label="품목 검색" className="maju-input" onChange={(event) => setSearch(event.target.value)} placeholder="품목·코드 검색" value={search} /></div>
    {tab === "신규" ? <section className="maju-section-card p-4"><h2 className="font-semibold">새 상품·확인 필요 {unmatched.length}개</h2><p className="text-sm text-slate-600">일치하는 상품이 없는 행은 아직 저장하지 않았습니다. 매입처 상품을 저장한 뒤 마스터 상품으로 일괄 생성·연결합니다.</p><div className="mt-3 flex flex-wrap gap-2"><input aria-label="새 상품 매입처명" className="maju-input" onChange={(event) => setNewSupplier(event.target.value)} placeholder="파일에 매입처가 없으면 입력" value={newSupplier} /><button className="maju-button-primary" disabled={!unmatched.length || busy} onClick={() => void createNewProducts()} type="button">상품으로 만들기</button><Link className="maju-button-secondary" href="/revenue/products?tab=supplier">기존 상품 업로드 보기</Link></div>{unmatched.map((row, index) => <p className="border-t py-2 text-sm" key={`${row.code}-${index}`}>{row.code || "코드 없음"} · {row.name} · {money(row.cost)}</p>)}</section> : <CommonDataTable columns={columns} emptyMessage="상품이 없습니다. 엑셀을 올리거나 상품관리에서 상품을 등록해 주세요." filename="매입가_변경후보.csv" rowKey={(row) => row.id} rows={displayed} settingsKey={`purchase-cost:${companyId}`} />}
    <div className="flex flex-wrap items-center gap-3 text-sm"><span>상품 {displayed.length}개 · 현재 합 {money(displayed.reduce((sum, row) => sum + row.cost, 0))} · 변경 후 합 {money(displayed.reduce((sum, row) => sum + (candidates[row.id]?.cost ?? row.cost), 0))}</span><button className="maju-button-secondary" disabled={busy || !undo} onClick={() => void restore()} type="button">직전 저장 되돌리기</button><Link className="text-teal-700 underline" href="/revenue/pricing/margins">마진 그룹 설정</Link></div>
    <p className="text-sm text-slate-600">직접 정한 판매가는 그대로 두고, 마진으로 계산하는 상품만 판매가를 다시 계산합니다. 저장 전 후보는 새로고침하면 사라집니다.</p>
  </div>;
}
