"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { PurchaseSheetMapper } from "@/components/purchase-sheet-mapper";
import { matchCostImportRow, type CostImportRow, type CostProduct } from "@/domains/pricing/purchase-cost";
import { buildPurchaseSheet, costExcludingVat, mergeDuplicateLines, parsePurchaseLines, suggestPurchaseMapping, type PurchaseImportLine, type PurchaseImportMapping, type PurchaseSheet, type VatMode } from "@/domains/pricing/purchase-import";
import { buildCatalogPreview, type CatalogMapping } from "@/domains/product/catalog-import";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { DocumentDraft } from "@/domains/pricing/document";
import { documentRequest } from "@/lib/pricing/document-client";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

// 11/4: 단가 원값(rawCost)과 부가세 포함 여부를 같이 들고, 저장 매입가(cost)는 항상 부가세 별도 기준입니다.
type Candidate = { cost: number; rawCost?: number; vatIncluded?: boolean; taxType?: "taxable" | "exempt"; quantity?: number; supplierProductId?: string; method: "직접" | "엑셀"; source: string };
const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function PurchaseCostWorkspace({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<CostProduct[]>([]);
  const [pricing, setPricing] = useState<PriceState | null>(null);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [documentError, setDocumentError] = useState("");
  const [candidates, setCandidates] = useState<Record<string, Candidate>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [unmatched, setUnmatched] = useState<CostImportRow[]>([]);
  const [sheet, setSheet] = useState<PurchaseSheet | null>(null);
  const [mapping, setMapping] = useState<PurchaseImportMapping>({});
  const [vatMode, setVatMode] = useState<VatMode>("auto");
  const [importedLines, setImportedLines] = useState<PurchaseImportLine[]>([]);
  const [receiptDate, setReceiptDate] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
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
  useUnsavedChangesWarning(Object.keys(candidates).length > 0 || Boolean(sheet));

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
    setDocumentError("");
    try {
      const all: DocumentDraft[] = [];
      for (let page = 1; page <= 200; page++) {
        const result = await documentRequest<{ items: DocumentDraft[]; total: number }>(companyId, "list", { page, search: "" });
        all.push(...result.result.items);
        if (all.length >= result.result.total) break;
      }
      if (all.some(document => !document.recalculation)) throw new Error("문서 가격 상태를 확인하지 못했습니다.");
      setDocuments(all);
    } catch { setDocuments([]); setDocumentError("문서 영향을 조회하지 못했습니다. 다시 불러와 주세요."); }
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
  const affected = useMemo(() => documents.map((document) => ({ document, count: new Set(document.content.lines.filter((line) => candidates[line.productId]?.cost !== undefined).map(line => line.productId)).size, changed: document.recalculation?.changedProductCount || 0 })).filter((entry) => entry.count > 0 || entry.changed > 0), [candidates, documents]);
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
    setCandidates((current) => ({ ...current, [product.id]: { cost, rawCost: cost, vatIncluded: false, supplierProductId: selectedSupplier?.supplierProductId, method: "직접", source: "직접 입력" } }));
    setSelected((current) => current.includes(product.id) ? current : [...current, product.id]);
  }, [products, supplier]);

  /** 11/4: 부가세 포함/별도를 언제든 바꿀 수 있습니다(선택 품목 또는 한 품목). */
  function setVatIncluded(ids: string[], included: boolean) {
    setCandidates((current) => {
      const next = { ...current };
      for (const id of ids) {
        const candidate = next[id];
        if (!candidate) continue;
        const raw = candidate.rawCost ?? candidate.cost;
        next[id] = { ...candidate, cost: costExcludingVat(raw, included), rawCost: raw, vatIncluded: included };
      }
      return next;
    });
  }

  async function saveReceipts() {
    if (!importedLines.length) return "";
    const response = await fetch("/api/price-sheets/receipts", {
      body: JSON.stringify({ companyId, fileName, lines: importedLines.map((line) => ({ ...line, raw: line.raw.slice(0, 40) })), receiptDate }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { saved?: number; message?: string } | null;
    if (response?.ok) { setImportedLines([]); return ` · 매입 기록 ${payload?.saved ?? 0}줄 보관`; }
    return ` · 매입 기록(수량 등) 보관은 ${payload?.message || "다음에 다시 시도"}`;
  }

  async function readFile(file: File) {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = file.name.toLocaleLowerCase().endsWith(".csv")
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" })
        : XLSX.read(buffer, { type: "array", cellDates: true });
      // 11/4: 위쪽 제목 줄을 건너뛰고 실제 머리글 줄을 찾습니다(빈 머리글은 'A열'로 표시).
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", header: 1, raw: false });
      const nextSheet = buildPurchaseSheet(matrix);
      if (!nextSheet.rows.length) throw new Error("파일에 품목이 없습니다.");
      setSheet(nextSheet);
      setMapping(suggestPurchaseMapping(nextSheet));
      setFileName(file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "엑셀을 읽지 못했습니다."); }
  }

  function applyFile() {
    if (!catalogReady) { setError("상품 목록을 불러온 뒤 다시 시도해 주세요."); return; }
    try {
      if (!sheet) return;
      const { lines, skipped } = parsePurchaseLines(sheet, mapping, vatMode);
      // 같은 파일 안 같은 품목은 한 줄로(수량 합산) → 매일 올려도 상품이 중복 생성되지 않게 비교 키로 기존 상품과 맞춥니다.
      const merged = mergeDuplicateLines(lines);
      const next: Record<string, Candidate> = {};
      const missing: CostImportRow[] = [];
      for (const line of merged) {
        const row: CostImportRow = { code: line.code, cost: line.cost, name: line.name, spec: line.spec, supplier: line.supplier, unit: line.unit };
        const matched = matchCostImportRow(row, products);
        if (matched && (!row.supplier || matched.supplierProductId)) next[matched.id] = { cost: line.cost, method: "엑셀", quantity: line.quantity, rawCost: line.rawCost, source: fileName, supplierProductId: matched.supplierProductId, taxType: line.taxType, vatIncluded: line.vatIncluded };
        else missing.push(row);
      }
      setCandidates((current) => ({ ...current, ...next }));
      setSelected((current) => Array.from(new Set([...current, ...Object.keys(next)])));
      setUnmatched(missing);
      setImportedLines(lines);
      setSheet(null);
      const vatCount = Object.values(next).filter((candidate) => candidate.vatIncluded).length;
      const exemptCount = lines.filter((line) => line.taxType === "exempt").length;
      const taxableCount = lines.filter((line) => line.taxType === "taxable").length;
      setMessage(`변경 후보 ${Object.keys(next).length}개 · 새 상품/확인 필요 ${missing.length}개${skipped.length ? ` · 품목·단가가 없어 건너뛴 행 ${skipped.length}개` : ""}${vatCount ? ` · 부가세 포함으로 본 품목 ${vatCount}개(별도 금액으로 바꿔 저장)` : ""}${mapping.vatAmount !== undefined ? ` · 부가세 열 기준 과세 ${taxableCount}개 · 면세 ${exemptCount}개` : ""}. 저장 전에는 반영되지 않습니다.`);
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
          if (!createdResponse.ok) throw new Error(created.message || "전체 상품 생성에 실패했습니다.");
          createdCount += Number(created.createdCount || 0);
        }
      }
      await command("recalculate");
      setUnmatched([]); await load();
      setMessage(`매입처 상품 ${savedCount}개 저장 · 전체 상품 ${createdCount}개 생성·연결 · 판매가 재계산 완료`);
    } catch (cause) { setError(`매입처 상품 ${savedCount}개 저장 · 전체 상품 ${createdCount}개 생성 완료. 일부 행은 매입처 상품만 저장됐을 수 있으니 상품관리에서 확인해 주세요. ${cause instanceof Error ? cause.message : "새 상품을 만들지 못했습니다."}`); }
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
      const receiptNote = await saveReceipts();
      setCandidates({}); setSelected([]); await load();
      setMessage(`매입가 ${changes.length}건 저장${batchId ? " · 판매가 재계산 완료" : " · 재계산 상태 확인 필요"}${receiptNote}. 이 화면에서 직전 저장을 되돌릴 수 있습니다.`);
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
    { key: "vat", label: "단가 기준", value: (row) => candidates[row.id]?.vatIncluded ? "부가세 포함" : candidates[row.id] ? "부가세 별도" : "-", render: (row) => candidates[row.id] ? <><button aria-label={`${row.name} 부가세 기준 바꾸기`} className={`rounded-full px-2 py-0.5 text-xs font-bold ${candidates[row.id].vatIncluded ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`} disabled={busy} onClick={() => setVatIncluded([row.id], !candidates[row.id].vatIncluded)} title={candidates[row.id].vatIncluded ? `원래 단가 ${money(candidates[row.id].rawCost ?? 0)} → 별도 ${money(candidates[row.id].cost)}` : "누르면 부가세 포함으로 바꿉니다"} type="button">{candidates[row.id].vatIncluded ? "포함" : "별도"}</button>{candidates[row.id].taxType ? <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${candidates[row.id].taxType === "exempt" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{candidates[row.id].taxType === "exempt" ? "면세" : "과세"}</span> : null}</> : "-" },
    { key: "quantity", label: "수량", align: "right", value: (row) => candidates[row.id]?.quantity ?? "", render: (row) => candidates[row.id]?.quantity != null ? candidates[row.id].quantity!.toLocaleString("ko-KR") : "-" },
    { key: "delta", label: "변동", value: (row) => candidates[row.id] ? (row.cost ? Math.round((candidates[row.id].cost / row.cost - 1) * 1000) / 10 : 0) : 0, render: (row) => candidates[row.id] ? `${candidates[row.id].cost >= row.cost ? "▲" : "▼"} ${row.cost ? Math.abs(Math.round((candidates[row.id].cost / row.cost - 1) * 1000) / 10) : "신규"}%` : "-" },
    { key: "method", label: "바꾼 방법·근거", value: (row) => candidates[row.id] ? `${candidates[row.id].method} · ${candidates[row.id].source}` : "-" },
    { key: "used", label: "쓰는 곳", value: (row) => (usedBy.get(row.id) || []).map((doc) => doc.content.title).join(", ") || "-", render: (row) => (usedBy.get(row.id) || []).length ? <Link className="text-teal-700 underline" href="/revenue/pricing/documents">{(usedBy.get(row.id) || []).length}개 문서</Link> : "-" },
  ], [busy, candidates, edit, selected, usedBy]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="space-y-4" aria-busy={busy}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">매입가 반영</h2><p className="text-sm text-slate-600">엑셀을 올리거나 직접 입력해 매입가를 바꿉니다. 같은 품목은 이름·규격으로 맞춰 새로 만들지 않습니다.</p></div><div className="flex flex-wrap gap-2"><button className="maju-button-secondary" onClick={exportTemplate} type="button">엑셀 양식</button><button className="maju-button-secondary" onClick={() => fileInput.current?.click()} type="button">엑셀 올리기</button><button className="maju-button-primary" disabled={busy || !selected.length} onClick={() => void save()} type="button">저장 ({selected.length}건)</button></div></header>
    <input accept=".xls,.xlsx,.csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} ref={fileInput} type="file" />
    {error ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-700">{error} <button className="underline" onClick={() => void load()} type="button">다시 시도</button></p> : null}
    {message ? <p role="status" className="rounded border border-teal-200 bg-teal-50 p-3">{message}</p> : null}
    {sheet ? <section className="maju-section-card min-w-0 space-y-3 p-3"><PurchaseSheetMapper mapping={mapping} onMapping={setMapping} onVatMode={setVatMode} sheet={sheet} vatMode={vatMode} /><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs font-bold text-slate-700">매입일<input aria-label="매입일" className="maju-input h-9" onChange={(event) => setReceiptDate(event.target.value)} type="date" value={receiptDate} /></label><button className="maju-button-primary" disabled={!catalogReady || mapping.name === undefined || mapping.cost === undefined} onClick={applyFile} type="button">열 맞추기 적용</button><button className="maju-button-secondary" onClick={() => setSheet(null)} type="button">취소</button></div></section> : null}
    {selected.length && tab !== "신규" ? <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600"><span>선택 {selected.length}개 단가 기준</span><button className="maju-button-secondary h-8 px-2.5 text-xs" disabled={busy} onClick={() => setVatIncluded(selected, true)} type="button">부가세 포함으로</button><button className="maju-button-secondary h-8 px-2.5 text-xs" disabled={busy} onClick={() => setVatIncluded(selected, false)} type="button">부가세 별도로</button><span className="font-semibold text-slate-400">저장되는 매입가는 항상 부가세 별도 금액입니다.</span></div> : null}
    <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">영향받는 문서</h2><p className="text-sm text-slate-600">확정 전에는 문서와 가격이 바뀌지 않습니다. 저장된 변경은 서버 이력으로 확인합니다. 다시 계산한 초안도 새 버전을 게시할 때까지 표시를 유지합니다.</p><div className="flex flex-wrap gap-2">{documentError ? <span role="alert">{documentError} <button className="underline" type="button" onClick={() => void load().catch(cause => setError(String(cause)))}>다시 시도</button></span> : affected.length ? affected.map(({ document, count, changed }) => <Link className="rounded border p-2 text-sm" href="/revenue/pricing/documents" key={document.id}>{document.content.kind === "sheet" ? "단가표" : "견적서"} · {document.content.title} · {changed ? `${changed}개 품목 다시 계산 필요` : `${count}개 품목 변경 후보`}{changed && count ? ` · 후보 ${count}개` : ""}</Link>) : <span className="text-sm text-slate-500">다시 계산할 문서나 변경 후보와 연결된 문서가 없습니다.</span>}</div></section>
    <div className="flex flex-wrap gap-2">{["변동 있음", "인상", "인하", "신규", "전체"].map((name) => <button aria-pressed={tab === name} className={tab === name ? "maju-button-primary" : "maju-button-secondary"} key={name} onClick={() => setTab(name)} type="button">{name}{name === "신규" ? ` ${unmatched.length}` : ""}</button>)}<select aria-label="매입처" className="maju-input" onChange={(event) => setSupplier(event.target.value)} value={supplier}><option value="">매입처 전체</option>{Array.from(new Set(products.map((product) => product.supplierName).filter((name): name is string => Boolean(name)))).map((name) => <option key={name} value={name}>{name}</option>)}</select><select aria-label="바꾼 방법" className="maju-input" onChange={(event) => setMethod(event.target.value)} value={method}><option value="">바꾼 방법 전체</option><option>직접</option><option>엑셀</option><option disabled>전표</option></select><input aria-label="품목 검색" className="maju-input" onChange={(event) => setSearch(event.target.value)} placeholder="품목·코드 검색" value={search} /></div>
    {tab === "신규" ? <section className="maju-section-card p-4"><h2 className="font-semibold">새 상품·확인 필요 {unmatched.length}개</h2><p className="text-sm text-slate-600">일치하는 상품이 없는 행은 아직 저장하지 않았습니다. 매입처 상품을 저장한 뒤 전체 상품으로 일괄 생성·연결합니다.</p><div className="mt-3 flex flex-wrap gap-2"><input aria-label="새 상품 매입처명" className="maju-input" onChange={(event) => setNewSupplier(event.target.value)} placeholder="파일에 매입처가 없으면 입력" value={newSupplier} /><button className="maju-button-primary" disabled={!unmatched.length || busy} onClick={() => void createNewProducts()} type="button">상품으로 만들기</button><Link className="maju-button-secondary" href="/revenue/products">전체 상품 보기</Link></div>{unmatched.map((row, index) => <p className="border-t py-2 text-sm" key={`${row.code}-${index}`}>{row.code || "코드 없음"} · {row.name} · {money(row.cost)}</p>)}</section> : <CommonDataTable columns={columns} emptyMessage="상품이 없습니다. 엑셀을 올리거나 상품관리에서 상품을 등록해 주세요." filename="매입가_변경후보.csv" rowKey={(row) => row.id} rows={displayed} settingsKey={`purchase-cost:${companyId}`} />}
    <div className="flex flex-wrap items-center gap-3 text-sm"><span>상품 {displayed.length}개 · 현재 합 {money(displayed.reduce((sum, row) => sum + row.cost, 0))} · 변경 후 합 {money(displayed.reduce((sum, row) => sum + (candidates[row.id]?.cost ?? row.cost), 0))}</span><button className="maju-button-secondary" disabled={busy || !undo} onClick={() => void restore()} type="button">직전 저장 되돌리기</button><Link className="text-teal-700 underline" href="/revenue/pricing/margins">마진 그룹 설정</Link></div>
    <p className="text-sm text-slate-600">직접 정한 판매가는 그대로 두고, 마진으로 계산하는 상품만 판매가를 다시 계산합니다. 저장 전 후보는 새로고침하면 사라집니다.</p>
  </div>;
}
