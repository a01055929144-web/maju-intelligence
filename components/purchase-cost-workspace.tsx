"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { PurchaseHistoryPanel } from "@/components/purchase-history-panel";
import type { PurchaseHistoryItem } from "@/domains/pricing/purchase-receipt";
import { PurchaseSheetMapper } from "@/components/purchase-sheet-mapper";
import { aliasKey, findDuplicateSuspects, matchByAlias, matchCostImportRow, type CostImportRow, type CostProduct, type PurchaseCostCandidate } from "@/domains/pricing/purchase-cost";
import { buildPurchaseSheet, COMMON_UNITS, costExcludingVat, mergeDuplicateLines, parsePurchaseLines, suggestPurchaseMapping, type PurchaseImportLine, type PurchasePriceConflict, type PurchaseImportMapping, type PurchaseSheet, type VatMode } from "@/domains/pricing/purchase-import";
import { buildCatalogPreview, type CatalogMapping } from "@/domains/product/catalog-import";
import { customerErpCode } from "@/domains/product/customer-erp-code";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { DocumentDraft } from "@/domains/pricing/document";
import { documentRequest } from "@/lib/pricing/document-client";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

// 11/4: 단가 원값(rawCost)과 부가세 포함 여부를 같이 들고, 저장 매입가(cost)는 항상 부가세 별도 기준입니다.
// rawName·fileSpec·fileUnit 은 엑셀 원문 그대로(원문 연결용), name·spec·unit 은 고친 값(상품관리에 저장).
type DatedProduct = CostProduct & { priceDate?: string };
type NewRow = CostImportRow & { purchaseDate?: string; rowId: string; quantity?: number; rawCost?: number; taxType?: "taxable" | "exempt"; vatIncluded?: boolean; rawName: string; fileSpec: string; fileUnit: string; notDuplicate?: boolean };
/** 11/4: 단가·견적·주문에는 단위가 꼭 필요합니다. 규격은 비워도 됩니다. */
const missingFields = (row: NewRow) => [!row.unit.trim() ? "단위" : "", !row.name.trim() ? "품목" : ""].filter(Boolean);
type LinkInput = { productId: string; rawName: string; spec: string; unit: string; cost: number; supplierName: string };
type Candidate = { purchaseDate?: string; cost: number; rawCost?: number; vatIncluded?: boolean; taxType?: "taxable" | "exempt"; quantity?: number; supplierProductId?: string; method: "직접" | "엑셀" | "매입처"; source: string; reviewOnly?: boolean; fileNote?: string; link?: LinkInput; updateFields?: { name: string; spec: string; unit: string } };
const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function PurchaseCostWorkspace({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<DatedProduct[]>([]);
  const [pricing, setPricing] = useState<PriceState | null>(null);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [documentError, setDocumentError] = useState("");
  const [candidates, setCandidates] = useState<Record<string, Candidate>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [unmatched, setUnmatched] = useState<NewRow[]>([]);
  const [sheet, setSheet] = useState<PurchaseSheet | null>(null);
  const [mapping, setMapping] = useState<PurchaseImportMapping>({});
  const [vatMode, setVatMode] = useState<VatMode>("auto");
  const [importedLines, setImportedLines] = useState<Array<PurchaseImportLine & { productId?: string }>>([]);
  const [conflictChoices, setConflictChoices] = useState<Record<string, string>>({});
  const [fileHasDates, setFileHasDates] = useState(false);
  const [fileHadConflicts, setFileHadConflicts] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [saveReview, setSaveReview] = useState(false);
  const [confirmedReview, setConfirmedReview] = useState("");
  const [purchaseDateEnabled, setPurchaseDateEnabled] = useState(false);
  // 11/4: 신규 탭 필터 — 켤 때의 행 목록을 고정해 두어, 입력 중에 줄이 사라지지 않게 합니다.
  const [newFilter, setNewFilter] = useState<"all" | "unit" | "suspect">("all");
  const [filterIds, setFilterIds] = useState<string[] | null>(null);
  const [rowPick, setRowPick] = useState<number[]>([]);
  const [bulkUnit, setBulkUnit] = useState("");
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState("");
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
  const [recalcPending, setRecalcPending] = useState(false);
  const [batchEnabled, setBatchEnabled] = useState(false);
  const [latestBatch, setLatestBatch] = useState<{ id: string; restoredAt: string | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const batchRequest = useRef<{ key: string; id: string } | null>(null);
  useUnsavedChangesWarning(selected.length > 0 || Object.values(candidates).some((candidate) => candidate.method !== "매입처") || Boolean(sheet));

  const load = useCallback(async (options: { documents?: boolean } = {}) => {
    setCatalogReady(false);
    const q = new URLSearchParams({ companyId });
    const [catalogResponse, pricingResponse, historyResponse] = await Promise.all([
      fetch(`/api/price-sheets/costs?${q}`, { cache: "no-store" }),
      fetch(`/api/price-sheets?${q}`, { cache: "no-store" }),
      options.documents === false ? null : fetch(`/api/price-sheets/receipts?${q}&summary=1`, { cache: "no-store" }).catch(() => null),
    ]);
    const catalog = await catalogResponse.json();
    const price = await pricingResponse.json();
    if (!catalogResponse.ok || !pricingResponse.ok) throw new Error(catalog.message || price.message || "매입가를 불러오지 못했습니다.");
    if (options.documents !== false) {
      const historyPayload = historyResponse?.ok ? await historyResponse.json().catch(() => null) as { summary?: PurchaseHistoryItem[] } | null : null;
      setHistory(Array.isArray(historyPayload?.summary) ? historyPayload.summary : []);
      setHistoryError(historyPayload ? "" : "최근 매입 변동을 확인하지 못했습니다. 새로고침해 주세요.");
    }
    setProducts(catalog.products);
    setBatchEnabled(catalog.batchEnabled === true);
    setPurchaseDateEnabled(catalog.purchaseDateEnabled === true);
    setLatestBatch(catalog.latestBatch || null);
    const serverCandidates = Object.fromEntries(((catalog.changes || []) as PurchaseCostCandidate[]).map((change) => [change.productId, {
      cost: change.cost,
      method: "매입처" as const,
      reviewOnly: change.direction === "review",
      source: change.reviewReason ? `${change.supplierName || "매입처"} · ${change.reviewReason}` : `${change.supplierName || "매입처"} 확정 최신 단가`
    }]));
    setCandidates((current) => ({
      ...serverCandidates,
      ...Object.fromEntries(Object.entries(current).filter(([, candidate]) => candidate.method !== "매입처"))
    }));
    const fresh = catalog.products as CostProduct[];
    setPricing(price);
    setCatalogReady(true);
    setDocumentError("");
    // 11/4: 저장 중간에는 문서 목록(여러 페이지)을 다시 읽지 않아 속도를 높입니다.
    if (options.documents === false) return catalog.products as CostProduct[];
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
    return fresh;
  }, [companyId]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "매입가를 불러오지 못했습니다.")); }, [load]);

  const unique = useMemo(() => Array.from(new Set(products.map((product) => product.id))).map((id) => {
    const linked = products.filter((product) => product.id === id);
    return linked.length === 1 ? linked[0] : { ...linked[0], supplierProductId: undefined, supplierName: "여러 매입처" };
  }), [products]);
  const historicalPrice = (id: string) => {
    const incomingDate = candidates[id]?.purchaseDate, currentDate = unique.find(product => product.id === id)?.priceDate;
    return Boolean(incomingDate && currentDate && incomingDate < currentDate);
  };
  const latestHistory = useMemo(() => {
    const byProduct = new Map<string, PurchaseHistoryItem>();
    for (const item of history) if (item.productId && (!byProduct.has(item.productId) || item.latestDate > byProduct.get(item.productId)!.latestDate)) byProduct.set(item.productId, item);
    return byProduct;
  }, [history]);
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
    if (method && (candidate?.method || (latestHistory.has(product.id) ? "매입 이력" : "")) !== method) return false;
    if (search && !`${product.code} ${product.name} ${product.spec}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))) return false;
    if (tab === "신규") return false;
    if (emptyOnly) return !product.unit;
    const last = latestHistory.get(product.id);
    if (tab === "변동 있음") return Boolean(candidate && (candidate.reviewOnly || candidate.cost !== product.cost)) || Boolean(last?.changeAmount);
    if (tab === "인상") return candidate && !candidate.reviewOnly && candidate.cost !== product.cost ? candidate.cost > product.cost : last?.direction === "up";
    if (tab === "인하") return candidate && !candidate.reviewOnly && candidate.cost !== product.cost ? candidate.cost < product.cost : last?.direction === "down";
    return true;
  });
  const recentNew = unique.filter((product) => product.createdAt && Date.parse(product.createdAt) >= Date.now() - 30 * 24 * 60 * 60 * 1000 &&
    (!supplier || products.some((entry) => entry.id === product.id && entry.supplierName === supplier)) &&
    (!search || `${product.code} ${product.name} ${product.spec}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))));
  const changeCounts = unique.filter((product) =>
    (!supplier || products.some((entry) => entry.id === product.id && entry.supplierName === supplier)) &&
    (!method || (candidates[product.id]?.method || (latestHistory.has(product.id) ? "매입 이력" : "")) === method) &&
    (!search || `${product.code} ${product.name} ${product.spec}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko")))
  ).reduce((counts, product) => {
    const candidate = candidates[product.id];
    const difference = candidate && !candidate.reviewOnly && candidate.cost !== product.cost ? candidate.cost - product.cost : latestHistory.get(product.id)?.changeAmount ?? 0;
    if (candidate?.reviewOnly || difference) counts.changed++;
    if (difference > 0) counts.up++;
    if (difference < 0) counts.down++;
    return counts;
  }, { changed: 0, up: 0, down: 0 });

  const edit = useCallback((product: CostProduct, raw: string) => {
    if (raw === "") { setCandidates((current) => { const next = { ...current }; delete next[product.id]; return next; }); setSelected((current) => current.filter((id) => id !== product.id)); return; }
    const cost = Number(raw);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000_000) return;
    const selectedSupplier = supplier ? products.find((entry) => entry.id === product.id && entry.supplierName === supplier) : product;
    setCandidates((current) => ({ ...current, [product.id]: { purchaseDate: current[product.id]?.purchaseDate, cost, rawCost: cost, vatIncluded: false, supplierProductId: selectedSupplier?.supplierProductId, method: "직접", source: "직접 입력" } }));
    setSelected((current) => cost === product.cost ? current.filter((id) => id !== product.id) : current.includes(product.id) ? current : [...current, product.id]);
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

  const importPreview = useMemo(() => {
    if (!sheet) return null;
    try {
      const parsed = parsePurchaseLines(sheet, mapping, vatMode);
      if (!parsed.lines.length && !parsed.dateIssues.length) throw new Error("적용할 품목·단가가 없습니다. 파일과 필수 열을 확인해 주세요.");
      const dateIssues = parsed.dateIssues;
      if (dateIssues.length) throw new Error(`구매일을 읽지 못한 원본 ${dateIssues.join(", ")}행을 수정해 주세요. 날짜 오류 행을 생략하고 저장하지 않습니다.`);
      const hasDates = mapping.purchaseDate !== undefined;
      const lines: PurchaseImportLine[] = parsed.lines.map((line: PurchaseImportLine) => {
        const date = hasDates ? line.purchaseDate : receiptDate;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
          throw new Error(`${line.rowNumber}행의 적용일을 확인해 주세요. 구매일 열이 있으면 빈 날짜를 업로드 적용일로 대신하지 않습니다.`);
        }
        return { ...line, purchaseDate: date };
      });
      const merged = mergeDuplicateLines(lines);
      const catalogGroups = new Map<string, { product: CostProduct; lines: PurchaseImportLine[] }>();
      for (const line of lines) {
        const product = matchByAlias(aliasKey(line.rawName, line.spec, line.unit), line.supplier, products) || matchCostImportRow(line, products)
          || matchCostImportRow({ ...line, supplier: "" }, unique);
        if (!product) continue;
        const key = `${product.id}|${line.purchaseDate}`;
        const group = catalogGroups.get(key) || { product, lines: [] };
        group.lines.push(line); catalogGroups.set(key, group);
      }
      const supplierConflicts: PurchasePriceConflict[] = [], covered = new Set<number>();
      for (const [key, group] of Array.from(catalogGroups.entries())) {
        if (new Set(group.lines.map(line => line.supplier)).size < 2 || new Set(group.lines.map(line => line.cost)).size < 2) continue;
        supplierConflicts.push({ key: `product:${key}`, name: group.product.name, spec: group.product.spec, unit: group.product.unit,
          supplier: "여러 매입처", purchaseDate: group.lines[0].purchaseDate, candidates: group.lines });
        group.lines.forEach(line => covered.add(line.rowNumber));
      }
      return { lines, merged: merged.filter(line => !covered.has(line.rowNumber)),
        conflicts: [...merged.conflicts.filter(group => !group.candidates.some(line => covered.has(line.rowNumber))), ...supplierConflicts],
        skipped: parsed.skipped, hasDates, error: "" };
    } catch (cause) {
      return { lines: [], merged: [], conflicts: [], skipped: [], hasDates: false, error: cause instanceof Error ? cause.message : "파일과 열 연결을 확인해 주세요." };
    }
  }, [sheet, mapping, vatMode, receiptDate, products, unique]);
  const unresolvedConflicts = importPreview?.conflicts.filter(group => !conflictChoices[group.key]).length || 0;
  const reviewDates = Array.from(importedLines.reduce((dates, line) => {
    const date = line.purchaseDate || receiptDate;
    dates.set(date, (dates.get(date) || 0) + 1);
    return dates;
  }, new Map<string, number>())).sort(([a], [b]) => a.localeCompare(b));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const requiresDateContract = importedLines.length > 0 && (fileHasDates || fileHadConflicts || receiptDate !== today);
  const dateSaveBlocked = requiresDateContract && !purchaseDateEnabled;
  const priceChangeCount = selected.filter(id => candidates[id] && candidates[id].cost !== unique.find(product => product.id === id)?.cost &&
    !historicalPrice(id)).length;
  const reviewKey = useMemo(() => JSON.stringify({ receiptDate, importedLines, candidates, selected, unmatched, newSupplier,
    currentPrices: unique.map(product => [product.id, product.cost, product.priceDate]) }),
  [receiptDate, importedLines, candidates, selected, unmatched, newSupplier, unique]);
  function changeReceiptDate(value: string) {
    setReceiptDate(value); setConfirmedReview("");
    if (!fileHasDates) {
      setImportedLines(current => current.map(line => ({ ...line, purchaseDate: value })));
      setCandidates(current => Object.fromEntries(Object.entries(current).map(([id, candidate]) => [id,
        candidate.method === "엑셀" ? { ...candidate, purchaseDate: value } : candidate])));
    }
  }

  async function saveReceipts(lines: Array<PurchaseImportLine & { productId?: string }>) {
    if (!lines.length) return { ok: true, note: "" };
    const response = await fetch("/api/price-sheets/receipts", {
      body: JSON.stringify({ companyId, fileName, lines: lines.map((line) => ({ ...line, supplier: line.supplier || newSupplier.trim() || products.find((product) => product.id === line.productId)?.supplierName || "기본 매입처", raw: line.raw.slice(0, 40) })), receiptDate }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { fieldsFilled?: number; saved?: number; message?: string; taxConflicts?: number; taxFilled?: number } | null;
    if (response?.ok) {
      setImportedLines([]);
      return { ok: true, note: ` · 매입 기록 ${payload?.saved ?? 0}줄 보관${payload?.taxFilled ? ` · 상품 과세 구분 ${payload.taxFilled}개 채움` : ""}${payload?.fieldsFilled ? ` · 상품 빈 칸(규격·단위) ${payload.fieldsFilled}개 채움` : ""}${payload?.taxConflicts ? ` · 과세 구분이 기존과 다른 상품 ${payload.taxConflicts}개는 그대로 둠(상품관리에서 확인)` : ""}` };
    }
    return { ok: false, note: `매입 기록(수량 등) 보관 실패: ${payload?.message || "다시 시도해 주세요"}` };
  }

  async function readFile(file: File) {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = file.name.toLocaleLowerCase().endsWith(".csv")
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" })
        : XLSX.read(buffer, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
      // 11/4: 위쪽 제목 줄을 건너뛰고 실제 머리글 줄을 찾습니다(빈 머리글은 'A열'로 표시).
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", header: 1, raw: false, dateNF: "yyyy-mm-dd" });
      const nextSheet = buildPurchaseSheet(matrix);
      if (!nextSheet.rows.length) throw new Error("파일에 품목이 없습니다.");
      setSheet(nextSheet);
      setConflictChoices({}); setSaveReview(false); setConfirmedReview("");
      setMapping(suggestPurchaseMapping(nextSheet));
      setFileName(file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "엑셀을 읽지 못했습니다."); }
  }

  function applyFile() {
    if (!catalogReady) { setError("상품 목록을 불러온 뒤 다시 시도해 주세요."); return; }
    try {
      if (!sheet) return;
      if (!importPreview || importPreview.error) throw new Error(importPreview?.error || "파일을 확인해 주세요.");
      if (unresolvedConflicts) throw new Error("서로 다른 단가가 있는 그룹마다 적용할 행을 선택하거나 가격 반영을 보류해 주세요.");
      const { lines, skipped } = importPreview;
      const held = importPreview.conflicts.filter(group => conflictChoices[group.key] === "hold");
      const merged = [...importPreview.merged, ...importPreview.conflicts.flatMap(group =>
        group.candidates.filter(line => String(line.rowNumber) === conflictChoices[group.key]))]
        .sort((a, b) => (b.purchaseDate || "").localeCompare(a.purchaseDate || ""));
      setHeldCount(held.length); setFileHasDates(importPreview.hasDates); setFileHadConflicts(importPreview.conflicts.length > 0); setSaveReview(false); setConfirmedReview("");
      const productByLine = new Map<string, string>();
      const matchedRows = new Map(lines.map(line => [line.rowNumber,
        matchByAlias(aliasKey(line.rawName, line.spec, line.unit), line.supplier, products) || matchCostImportRow(line, products)]));
      const target = (line: PurchaseImportLine) => matchedRows.get(line.rowNumber)?.id || `${line.code || line.lineKey}|${line.supplier}`;
      const latest = new Map<string, string>();
      for (const line of lines) {
        const key = target(line), date = line.purchaseDate || receiptDate;
        if (date > (latest.get(key) || "")) latest.set(key, date);
        const matched = matchedRows.get(line.rowNumber);
        if (matched) productByLine.set(`${line.lineKey}|${line.code}|${line.supplier}`, matched.id);
      }
      const heldTargets = new Set(held.flatMap(group => group.candidates.filter(line =>
        (line.purchaseDate || receiptDate) === latest.get(target(line))).map(target)));
      const selectedPrices = new Map<string, Set<number>>();
      for (const line of merged) {
        const key = `${target(line)}|${line.purchaseDate}`;
        const prices = selectedPrices.get(key) || new Set<number>();
        prices.add(line.cost); selectedPrices.set(key, prices);
      }
      const next: Record<string, Candidate> = {};
      const missing: NewRow[] = [], seen = new Set<string>();
      for (const line of merged) {
        const key = target(line), date = line.purchaseDate || receiptDate;
        if (date !== latest.get(key) || heldTargets.has(key) || seen.has(key)) continue;
        if ((selectedPrices.get(`${key}|${line.purchaseDate}`)?.size || 0) > 1) {
          throw new Error(`${line.name}: 서로 다른 원문이 같은 상품·적용일로 연결됩니다. 원본 파일의 단가를 확인해 한 가지로 정리해 주세요.`);
        }
        seen.add(key);
        const row: CostImportRow = { code: line.code, cost: line.cost, name: line.name, spec: line.spec, supplier: line.supplier, unit: line.unit };
        const matched = matchedRows.get(line.rowNumber);
        const current = matched ? unique.find(product => product.id === matched.id) : undefined;
        if (current?.priceDate && date < current.priceDate) continue;
        const fileNote = matched ? [matched.name.replace(/\s+/g, "") !== line.name.replace(/\s+/g, "") ? `파일 품목명 ${line.name}` : "", (matched.spec || "").replace(/\s+/g, "").toLowerCase() !== line.spec.replace(/\s+/g, "").toLowerCase() && line.spec ? `파일 규격 ${line.spec}` : "", (matched.unit || "").toLowerCase() !== line.unit.toLowerCase() && line.unit ? `파일 단위 ${line.unit}` : ""].filter(Boolean).join(" · ") : "";
        if (matched && (!row.supplier || matched.supplierProductId)) next[matched.id] = { purchaseDate: date, cost: line.cost, method: "엑셀", quantity: line.quantity, rawCost: line.rawCost, source: fileName, supplierProductId: matched.supplierProductId, taxType: line.taxType, vatIncluded: line.vatIncluded, ...(fileNote ? { fileNote } : {}) };
        else missing.push({ ...row, purchaseDate: date, rowId: String(line.rowNumber), fileSpec: line.spec, fileUnit: line.unit, quantity: line.quantity, rawCost: line.rawCost, rawName: line.rawName, taxType: line.taxType, vatIncluded: line.vatIncluded });
      }
      const touched = new Set(Array.from(matchedRows.values()).flatMap(product => product ? [product.id] : []));
      setCandidates(current => ({ ...Object.fromEntries(Object.entries(current).filter(([id]) => !touched.has(id))), ...next }));
      setSelected(current => Array.from(new Set([...current.filter(id => !touched.has(id)), ...Object.keys(next)])));
      setUnmatched(missing);
      setRowPick([]);
      setImportedLines(lines.map((line) => ({ ...line, productId: productByLine.get(`${line.lineKey}|${line.code}|${line.supplier}`) })));
      setSheet(null);
      if (missing.some((row) => missingFields(row).length)) openFilter("unit", missing);
      else if (missing.some((row) => findDuplicateSuspects(row, unique, 1).length)) openFilter("suspect", missing);
      else if (!Object.keys(next).length && missing.length) setTab("신규");
      const vatCount = Object.values(next).filter((candidate) => candidate.vatIncluded).length;
      const exemptCount = lines.filter((line) => line.taxType === "exempt").length;
      const taxableCount = lines.filter((line) => line.taxType === "taxable").length;
      setMessage(`변경 후보 ${Object.keys(next).length}개 · 새 상품/확인 필요 ${missing.length}개${skipped.length ? ` · 품목·단가가 없어 건너뛴 행 ${skipped.length}개` : ""}${vatCount ? ` · 부가세 포함으로 본 품목 ${vatCount}개(별도 금액으로 바꿔 저장)` : ""}${mapping.vatAmount !== undefined ? ` · 부가세 열 기준 과세 ${taxableCount}개 · 면세 ${exemptCount}개` : ""}. 내용을 고친 뒤 '저장'을 누르면 새 상품은 상품관리에 등록되고 매입가·매입 기록이 함께 저장됩니다.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "열 맞추기를 확인해 주세요."); }
  }

  /** 새 상품을 상품관리(전체 상품)에 등록합니다. 매입처가 없으면 입력값 → 없으면 '기본 매입처'. */
  async function createNewProducts(rows: NewRow[]) {
    let createdCount = 0, categorySuggestedCount = 0;
    const groups = new Map<string, NewRow[]>();
    for (const row of rows) {
      const name = row.supplier || newSupplier.trim() || "기본 매입처";
      const list = groups.get(name) || [];
      list.push(row); groups.set(name, list);
    }
    const catalogMapping: CatalogMapping = { productName: "상품명", spec: "규격", unit: "단위", cost: "매입가", productCode: "기본코드", quantity: "수량" };
    for (const [supplierName, items] of Array.from(groups.entries())) {
      const raw = items.map((row) => ({ 상품명: row.rawName || row.name, 규격: row.rawName ? row.fileSpec : row.spec, 단위: row.rawName ? row.fileUnit : row.unit, 매입가: row.cost, 기본코드: row.code, 수량: row.quantity ?? "" }));
      const preview = buildCatalogPreview(raw, catalogMapping, supplierName);
      const response = await fetch("/api/product-catalog/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-import", companyId, fileName: fileName || "매입가 반영", supplierName, mapping: catalogMapping, products: preview.products, excludedCount: preview.excludedCount, warnings: preview.warnings }) });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.message || "새 상품 등록에 실패했습니다.");
      const ids = (saved.unmatchedSupplierProductIds || []) as string[];
      const chunks: string[][] = [];
      for (let offset = 0; offset < ids.length; offset += 100) chunks.push(ids.slice(offset, offset + 100));
      const counts = await Promise.all(chunks.map(async (chunk) => {
        const createdResponse = await fetch("/api/product-catalog/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-standards", companyId, supplierProductIds: chunk }) });
        const created = await createdResponse.json().catch(() => ({}));
        if (!createdResponse.ok) throw new Error(created.message || "상품관리 등록에 실패했습니다.");
        return { created: Number(created.createdCount || 0), suggested: Number(created.categorySuggestedCount || 0) };
      }));
      createdCount += counts.reduce((sum, value) => sum + value.created, 0);
      categorySuggestedCount += counts.reduce((sum, value) => sum + value.suggested, 0);
    }
    return { categorySuggestedCount, createdCount };
  }

  /** 중복 의심 → 기존 상품에 연결. 원문을 기억해 두어 다음 업로드부터 자동으로 붙습니다. */
  function linkNewRow(index: number, productId: string, updateProduct: boolean) {
    const row = unmatched[index];
    const product = unique.find((item) => item.id === productId);
    if (!row || !product) return;
    setCandidates((current) => ({ ...current, [productId]: {
      purchaseDate: row.purchaseDate, cost: row.cost, rawCost: row.rawCost, vatIncluded: row.vatIncluded, taxType: row.taxType, quantity: row.quantity, method: "엑셀", source: fileName,
      fileNote: updateProduct ? `상품 정보를 파일 값으로 변경 (${[row.name, row.spec, row.unit].filter(Boolean).join(" · ")})` : `연결: 파일 ${row.rawName || row.name}`,
      link: { productId, rawName: row.rawName || row.name, spec: row.fileSpec, unit: row.fileUnit, cost: row.cost, supplierName: row.supplier || newSupplier.trim() || "기본 매입처" },
      ...(updateProduct ? { updateFields: { name: row.name, spec: row.spec, unit: row.unit || product.unit } } : {})
    } }));
    setSelected((current) => current.includes(productId) ? current : [...current, productId]);
    setUnmatched((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setRowPick([]);
    setImportedLines((current) => current.map((line) => (line.rawName === row.rawName ? { ...line, productId } : line)));
    setMessage(`${row.name} → 기존 상품 ${product.name}에 연결했습니다. 저장하면 다음 업로드부터 자동으로 붙습니다.`);
  }

  function applyBulkUnit(target: "picked" | "empty") {
    const unit = bulkUnit.trim();
    if (!unit) { setError("넣을 단위를 입력해 주세요."); return; }
    setUnmatched((current) => current.map((row, index) => (target === "picked" ? rowPick.includes(index) : !row.unit.trim()) ? { ...row, unit } : row));
    setRowPick([]);
  }

  function openFilter(kind: "all" | "unit" | "suspect", rows: NewRow[] = unmatched) {
    setTab("신규");
    setNewFilter(kind);
    setFilterIds(kind === "all" ? null : rows.filter((row) => kind === "unit" ? missingFields(row).length > 0 : !row.notDuplicate && findDuplicateSuspects(row, unique, 1).length > 0).map((row) => row.rowId));
    if (kind === "unit") window.setTimeout(() => focusNextEmptyUnit(), 50);
  }

  /** 빈 단위 칸으로 바로 이동(엔터·빠른 단위 버튼 뒤). */
  function focusNextEmptyUnit(after?: HTMLElement | null) {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-unit-input]"));
    const start = after ? inputs.indexOf(after as HTMLInputElement) + 1 : 0;
    const next = inputs.slice(start).find((input) => !input.value.trim()) || inputs.find((input) => !input.value.trim());
    next?.focus();
  }

  function updateNewRow(index: number, patch: Partial<NewRow>) {
    setUnmatched((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  /** 11/4: 표에서 품목·규격·단위·과세를 바로 고칩니다(상품관리와 같은 원장). */
  async function saveProductField(product: CostProduct, field: "name" | "spec" | "unit" | "taxType", value: string) {
    if ((product[field] ?? "") === value) return;
    const response = await fetch("/api/price-sheets/products", { body: JSON.stringify({ companyId, id: product.id, [field]: value }), headers: { "Content-Type": "application/json" }, method: "PATCH" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { message?: string } | null;
    if (!response?.ok) { setError(payload?.message || "상품 정보를 저장하지 못했습니다."); return; }
    setProducts((current) => current.map((item) => (item.id === product.id ? { ...item, [field]: field === "taxType" ? (value || undefined) : value } : item)));
    setMessage(`${product.name} ${field === "name" ? "품목명" : field === "spec" ? "규격" : field === "unit" ? "단위" : "과세 구분"}을(를) 저장했습니다.`);
  }

  async function command(action: "recalculate" | "restore", batchId?: string) {
    const response = await fetch(`/api/price-sheets?companyId=${encodeURIComponent(companyId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, batchId }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "재계산에 실패했습니다.");
    setPricing(payload);
    return payload as PriceState;
  }

  async function retryRecalculation() {
    setBusy(true); setError(""); setMessage("");
    try {
      await command("recalculate");
      setRecalcPending(false);
      setMessage("판매가를 다시 계산했습니다. 변경 품목과 영향받는 문서를 확인해 주세요.");
      await load().catch(() => setError("판매가는 재계산됐지만 목록을 불러오지 못했습니다. 목록 새로고침을 눌러 확인해 주세요."));
    } catch (cause) {
      setError(`판매가 재계산이 끝나지 않았습니다. 매입가는 다시 저장하지 말고 재계산을 재시도해 주세요. ${cause instanceof Error ? cause.message : ""}`);
    } finally { setBusy(false); }
  }

  async function save() {
    if (importedLines.length && confirmedReview !== reviewKey) { setSaveReview(true); setError("적용 날짜와 건수를 확인하고 동의한 뒤 저장해 주세요."); return; }
    if (importedLines.some(line => !line.purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(line.purchaseDate))) { setError("저장할 원본 거래의 적용일을 확인해 주세요."); return; }
    const changes = selected.filter((id) => candidates[id] && candidates[id].cost !== unique.find((item) => item.id === id)?.cost &&
      !historicalPrice(id)).map((id) => {
      const product = unique.find((item) => item.id === id)!;
      return { productId: id, supplierProductId: candidates[id].supplierProductId, expectedCost: product.cost, cost: candidates[id].cost, fileName: candidates[id].source, ...(requiresDateContract && candidates[id].purchaseDate ? { priceDate: candidates[id].purchaseDate } : {}) };
    });
    // 11/4: 바뀐 매입가가 없어도 새 상품 등록·매입 기록 보관은 진행합니다(예전에는 버튼이 반응하지 않았음).
    if (!changes.length && !unmatched.length && !importedLines.length) { setMessage("저장할 변경이 없습니다."); return; }
    if (batchEnabled && changes.length > 100) { setError(`가격 변경 ${changes.length}건은 한 번에 저장할 수 없습니다. 최대 100건씩 선택해 주세요. 새 상품·원본 이력도 아직 저장하지 않았습니다.`); return; }
    if (unmatched.some((row) => missingFields(row).length || !Number.isFinite(row.cost) || row.cost < 0)) { setError("새 상품의 품목·단위·단가를 채워 주세요."); openFilter("unit", unmatched); return; }
    if (dateSaveBlocked) { setError("구매일 기준 저장은 아직 준비 중입니다. 날짜 보호와 원본 이력 저장을 지원하는 저장 경로가 준비된 뒤 다시 시도해 주세요."); return; }
    setSaveReview(false); setConfirmedReview("");
    setBusy(true); setError(""); setMessage("");
    const notes: string[] = [];
    const newRows = unmatched;
    try {
      if (unmatched.length) {
        setMessage(`저장 중… 새 상품 ${unmatched.length}개 상품관리 등록`);
        const created = await createNewProducts(unmatched);
        notes.push(`새 상품 ${created.createdCount}개 상품관리에 등록${created.categorySuggestedCount ? ` · 분류 추천 ${created.categorySuggestedCount}개는 상품관리에서 확인 후 저장` : ""}`);
        setUnmatched([]);
      }
      if (changes.length && !batchEnabled) {
        const response = await fetch("/api/price-sheets/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, changes }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "매입가를 저장하지 못했습니다.");
        notes.push(`매입가 ${changes.length}건 저장`);
        setUndo({ changes: changes.map((change) => ({ productId: change.productId, supplierProductId: change.supplierProductId, expectedCost: change.cost, cost: change.expectedCost })) });
      }
      setMessage("저장 중… 상품 정보·원문 연결·매입 기록 정리");
      const fresh = await load({ documents: false });
      // 새로 등록한 상품까지 다시 맞춰 매입 기록에 상품을 연결합니다.
      const relinked = importedLines.map((line) => line.productId ? line : { ...line, productId: (matchByAlias(aliasKey(line.rawName, line.spec, line.unit), "", fresh) || matchCostImportRow({ code: line.code, cost: line.cost, name: line.name, spec: line.spec, supplier: "", unit: line.unit }, fresh))?.id });
      // 원문 연결(중복 의심 → 기존 상품) 저장 + '상품 정보도 변경'을 고른 것 반영
      const links = Object.values(candidates).map((candidate) => candidate.link).filter((link): link is LinkInput => Boolean(link));
      const edits: Array<Record<string, string>> = [];
      for (const [productId, candidate] of Object.entries(candidates)) if (candidate.updateFields) edits.push({ id: productId, ...candidate.updateFields });
      for (const row of newRows) {
        const product = matchByAlias(aliasKey(row.rawName || row.name, row.rawName ? row.fileSpec : row.spec, row.rawName ? row.fileUnit : row.unit), "", fresh) || matchCostImportRow({ ...row, supplier: "" }, fresh);
        if (product) edits.push({ id: product.id, name: row.name, spec: row.spec, unit: row.unit, ...(row.taxType ? { taxType: row.taxType } : {}) });
      }
      // 원문 연결과 상품 정보 반영을 동시에(저장 속도)
      const [linkResult, editResult] = await Promise.all([
        links.length ? fetch("/api/price-sheets/links", { body: JSON.stringify({ companyId, fileName, links }), headers: { "Content-Type": "application/json" }, method: "POST" }).then(async (response) => ({ ok: response.ok, linked: ((await response.json().catch(() => null)) as { linked?: number } | null)?.linked ?? 0 })).catch(() => ({ ok: false, linked: 0 })) : Promise.resolve(null),
        edits.length ? fetch("/api/price-sheets/products", { body: JSON.stringify({ companyId, items: edits }), headers: { "Content-Type": "application/json" }, method: "PATCH" }).then((response) => response.ok).catch(() => false) : Promise.resolve(null)
      ]);
      const warnings: string[] = [];
      if (linkResult) linkResult.ok ? notes.push(`원문 연결 ${linkResult.linked}개`) : warnings.push("원문 연결 실패: 엑셀을 다시 올려 연결을 확인해 주세요");
      if (editResult === false) warnings.push("상품 정보 수정 실패: 상품관리에서 품목명·규격·단위를 확인해 주세요");
      const receipt = await saveReceipts(relinked);
      if (!receipt.ok) warnings.push(`${receipt.note}. 매입 기록은 다시 저장할 수 있습니다`);
      if (changes.length && batchEnabled) {
        const batchChanges = changes.map((change) => ({
          ...change,
          ...(change.supplierProductId ? { expectedSupplierCost: products.find((product) => product.id === change.productId && product.supplierProductId === change.supplierProductId)?.supplierRawCost ?? null } : {})
        }));
        const key = JSON.stringify(batchChanges);
        const batchId = batchRequest.current?.key === key ? batchRequest.current.id : crypto.randomUUID();
        batchRequest.current = { key, id: batchId };
        const response = await fetch("/api/price-sheets/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-batch", companyId, batchId, changes: batchChanges }) });
        const result = await response.json();
        if (!response.ok) throw new Error(`매입가·판매가 일괄 저장 실패: ${result.message || "다시 확인해 주세요"}`);
        if (!['applied', 'already_applied'].includes(result.status)) throw new Error("이미 복구된 저장 요청입니다. 목록을 새로고침해 현재 가격을 확인해 주세요.");
        batchRequest.current = null;
        setLatestBatch({ id: batchId, restoredAt: null });
        setUndo(null);
        notes.push(`매입가 ${changes.length}건·판매가 함께 저장`);
      }
      setCandidates({}); setSelected([]); setTab("전체"); setHistoryKey((value) => value + 1);
      if ((changes.length || notes.length) && (!batchEnabled || !changes.length)) {
        const previousBatch = pricing?.lastBatch;
        try {
          const updated = await command("recalculate");
          const newBatchId = updated.lastBatch;
          if (newBatchId && newBatchId !== previousBatch) setUndo((current) => current ? { ...current, batchId: newBatchId } : current);
          setRecalcPending(false);
          notes.push("판매가 재계산 완료");
        } catch (cause) {
          setRecalcPending(true);
          throw new Error(`판매가 재계산은 실패했습니다. 매입가를 다시 저장하지 말고 아래 '판매가 다시 계산'을 눌러 마무리해 주세요. ${cause instanceof Error ? cause.message : ""}`);
        }
      }
      void load().catch(() => setError("저장은 완료됐지만 목록을 불러오지 못했습니다. 목록 새로고침을 눌러 확인해 주세요."));
      if (warnings.length) {
        setError(`일부만 저장됐습니다: ${notes.join(" · ") || "매입가 변경 없음"}. ${warnings.join(" · ")}. 저장된 매입가는 다시 올리지 말고 실패 항목만 확인해 주세요.`);
      } else {
        setMessage(`${notes.join(" · ")}${receipt.note}. 표에서 품목·규격·단위·과세를 바로 고칠 수 있습니다.`);
      }
    } catch (cause) { setMessage(""); setError(`${notes.length ? `${notes.join(" · ")} 후 멈췄습니다. ` : ""}${cause instanceof Error ? cause.message : "저장하지 못했습니다."}`); await load().catch(() => undefined); }
    finally { setBusy(false); }
  }

  async function restore() {
    const atomicBatchId = batchEnabled && latestBatch && !latestBatch.restoredAt ? latestBatch.id : null;
    if ((!undo && !atomicBatchId) || !window.confirm("직전 매입가 변경과 판매가 계산을 되돌릴까요?")) return;
    setBusy(true); setError("");
    try {
      if (atomicBatchId) {
        const response = await fetch("/api/price-sheets/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore-batch", companyId, batchId: atomicBatchId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "원자적 복구에 실패했습니다.");
        setLatestBatch({ id: atomicBatchId, restoredAt: new Date().toISOString() });
        setUndo(null);
        await load();
        setMessage("직전 매입가·판매가를 함께 복구했습니다.");
        return;
      }
      if (!undo) return;
      if (undo.batchId) await command("restore", undo.batchId);
      const response = await fetch("/api/price-sheets/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, changes: undo.changes.map((change) => ({ ...change, fileName: "직전 저장 복구" })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "매입가 복구에 실패했습니다.");
      setUndo(null); await load(); setMessage("직전 매입가 변경을 복구했습니다.");
    } catch (cause) { setError(`복구가 끝나지 않았습니다. 가격을 확인해 주세요. ${cause instanceof Error ? cause.message : ""}`); }
    finally { setBusy(false); }
  }

  function exportTemplate() {
    const csv = ["ERP 코드,품목,규격,단위,매입처,매입가", ...unique.map((product) => [customerErpCode(product.code), product.name, product.spec, product.unit, product.supplierName || "", product.cost].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "매입가_엑셀_양식.csv"; link.click(); URL.revokeObjectURL(url);
  }

  const columns = useMemo<CommonTableColumn<CostProduct>[]>(() => [
    { key: "select", label: "선택", value: (row) => selected.includes(row.id) ? "선택" : "", render: (row) => <input aria-label={`${row.name} 선택`} checked={selected.includes(row.id)} disabled={!candidates[row.id] || candidates[row.id].reviewOnly || busy} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} type="checkbox" /> },
    { key: "name", label: "품목", value: (row) => row.name, render: (row) => <><input aria-label={`${row.name} 품목명`} className="h-8 w-full min-w-[160px] rounded-md border border-transparent bg-transparent px-1.5 text-sm font-semibold hover:border-slate-200 focus:border-teal-400 focus:bg-white" defaultValue={row.name} disabled={busy} key={`${row.id}-${row.name}`} onBlur={(event) => void saveProductField(row, "name", event.target.value.trim())} />{customerErpCode(row.code) ? <small className="block px-1.5 text-slate-500">{customerErpCode(row.code)}</small> : null}{candidates[row.id]?.fileNote ? <small className="block px-1.5 font-semibold text-amber-700">⚠ {candidates[row.id].fileNote}</small> : null}</> },
    { key: "spec", label: "규격", value: (row) => row.spec, render: (row) => <input aria-label={`${row.name} 규격`} className="h-8 w-24 rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-slate-200 focus:border-teal-400 focus:bg-white" defaultValue={row.spec} disabled={busy} key={`${row.id}-${row.spec}`} onBlur={(event) => void saveProductField(row, "spec", event.target.value.trim())} placeholder="-" /> },
    { key: "unit", label: "단위", value: (row) => row.unit, render: (row) => <input aria-label={`${row.name} 단위 검색·선택`} className="maju-input w-24" defaultValue={row.unit} disabled={busy} key={`${row.id}-${row.unit}`} list="purchase-unit-options" onBlur={(event) => { const value = event.target.value.trim(); if (value) void saveProductField(row, "unit", value); else event.target.value = row.unit; }} placeholder="단위 검색" /> },
    { key: "supplier", label: "매입처", value: (row) => row.supplierName || "-" },
    { key: "current", label: "현재 매입가", align: "right", total: true, value: (row) => row.cost, render: (row) => money(row.cost) },
    { key: "priceDate", label: "적용일", value: row => candidates[row.id]?.purchaseDate || (row as DatedProduct).priceDate || "-" },
    { key: "previous", label: "직전 매입가", align: "right", value: (row) => latestHistory.get(row.id)?.previousCost ?? "-", render: (row) => latestHistory.get(row.id)?.previousCost != null ? money(latestHistory.get(row.id)!.previousCost!) : "-" },
    { key: "next", label: "변경 후 매입가", align: "right", total: true, value: (row) => candidates[row.id]?.cost ?? row.cost, render: (row) => candidates[row.id] ? <input aria-label={`${row.name} 변경 후 매입가 수정`} className="maju-input w-28" disabled={busy} min="0" max="1000000000" step="0.01" type="number" value={candidates[row.id].cost} onChange={(event) => edit(row, event.target.value)} /> : <span className="whitespace-nowrap text-slate-500">{money(row.cost)} <button className="text-xs text-teal-700 underline" disabled={busy} onClick={() => edit(row, String(row.cost))} type="button">수정</button></span> },
    { key: "delta", label: "변동", align: "right", value: (row) => candidates[row.id] && !candidates[row.id].reviewOnly ? candidates[row.id].cost - row.cost : latestHistory.get(row.id)?.changeAmount ?? 0, render: (row) => {
      const candidate = candidates[row.id];
      if (candidate?.reviewOnly) return "확인 필요";
      const difference = candidate ? candidate.cost - row.cost : latestHistory.get(row.id)?.changeAmount;
      const rate = candidate ? row.cost ? Math.round((candidate.cost / row.cost - 1) * 1000) / 10 : null : latestHistory.get(row.id)?.changeRate;
      if (!difference) return "-";
      return <span className={difference > 0 ? "text-rose-600" : "text-blue-600"}>{difference > 0 ? "▲" : "▼"} {money(Math.abs(difference))}{rate != null ? ` (${Math.abs(rate)}%)` : ""}</span>;
    } },
    { key: "quantity", label: "업로드 수량", align: "right", value: (row) => candidates[row.id]?.quantity ?? "", render: (row) => candidates[row.id]?.quantity != null ? candidates[row.id].quantity!.toLocaleString("ko-KR") : "-" },
    { key: "date", label: "최근 매입일", value: (row) => latestHistory.get(row.id)?.latestDate || "-" },
    { key: "method", label: "바꾼 방법·근거", value: (row) => candidates[row.id] ? `${candidates[row.id].method} · ${candidates[row.id].source}` : latestHistory.has(row.id) ? "매입 이력" : "-" },
    { key: "vat", label: "단가 기준", value: (row) => candidates[row.id]?.vatIncluded ? "부가세 포함" : candidates[row.id] ? "부가세 별도" : "-", render: (row) => candidates[row.id] ? <><button aria-label={`${row.name} 부가세 기준 바꾸기`} className={`rounded-full px-2 py-0.5 text-xs font-bold ${candidates[row.id].vatIncluded ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`} disabled={busy} onClick={() => setVatIncluded([row.id], !candidates[row.id].vatIncluded)} title={candidates[row.id].vatIncluded ? `원래 단가 ${money(candidates[row.id].rawCost ?? 0)} → 별도 ${money(candidates[row.id].cost)}` : "누르면 부가세 포함으로 바꿉니다"} type="button">{candidates[row.id].vatIncluded ? "포함" : "별도"}</button>{candidates[row.id].taxType ? <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${candidates[row.id].taxType === "exempt" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{candidates[row.id].taxType === "exempt" ? "면세" : "과세"}</span> : null}</> : "-" },
    { key: "tax", label: "과세", value: (row) => row.taxType === "taxable" ? "과세" : row.taxType === "exempt" ? "면세" : "미정", render: (row) => <select aria-label={`${row.name} 과세 구분`} className="h-8 rounded-md border border-slate-200 bg-white px-1 text-xs" disabled={busy} onChange={(event) => void saveProductField(row, "taxType", event.target.value)} value={row.taxType || ""}><option value="">미정</option><option value="taxable">과세</option><option value="exempt">면세</option></select> },
    { key: "used", label: "쓰는 곳", value: (row) => (usedBy.get(row.id) || []).map((doc) => doc.content.title).join(", ") || "-", render: (row) => (usedBy.get(row.id) || []).length ? <Link className="text-teal-700 underline" href="/revenue/pricing/documents">{(usedBy.get(row.id) || []).length}개 문서</Link> : "-" },
  ], [busy, candidates, edit, latestHistory, selected, usedBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const missingTotal = unmatched.filter((row) => missingFields(row).length).length;
  const unitCounts = new Map<string, number>();
  for (const unit of [...unmatched.map((row) => row.unit), ...products.map((product) => product.unit)]) if (unit.trim()) unitCounts.set(unit.trim(), (unitCounts.get(unit.trim()) || 0) + 1);
  const quickUnits = Array.from(new Set([...Array.from(unitCounts.entries()).sort((a, b) => b[1] - a[1]).map(([unit]) => unit), "EA", "BOX", "PACK", "KG", "통"])).slice(0, 6);
  const suspectCount = unmatched.filter((row) => !row.notDuplicate && findDuplicateSuspects(row, unique, 1).length).length;
  const unitOptions = Array.from(new Set([...COMMON_UNITS, ...products.map((product) => product.unit).filter(Boolean)]));

  return <div className="min-w-0 space-y-4" aria-busy={busy}>
    <datalist id="purchase-unit-options">{unitOptions.map((unit) => <option key={unit} value={unit} />)}</datalist>
    {/* 11/4: 매입일·엑셀 올리기·열 정렬·저장을 한 줄에. 지금 눌러야 할 버튼을 강조합니다. */}
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold">매입가 업로드</h2>
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">업로드 적용일<input aria-label="매입일" className="maju-input min-h-11 max-w-full" onChange={(event) => changeReceiptDate(event.target.value)} type="date" value={receiptDate} /></label>
        <button className={`min-h-11 ${sheet || importedLines.length ? "maju-button-secondary" : "maju-button-primary"}`} onClick={() => fileInput.current?.click()} type="button">① 엑셀 올리기</button>
        <button className={`min-h-11 ${sheet ? "maju-button-primary ring-2 ring-teal-300 ring-offset-1" : "maju-button-secondary"}`} disabled={!sheet || !catalogReady || mapping.name === undefined || mapping.cost === undefined || Boolean(importPreview?.error) || unresolvedConflicts > 0} onClick={applyFile} title={sheet ? "아래 표에서 열 이름을 확인한 뒤 누르세요" : "엑셀을 먼저 올려 주세요"} type="button">② 열 정렬</button>
        <button className={`maju-button-primary min-h-11 ${!sheet && (selected.length || unmatched.length) && !missingTotal ? "ring-2 ring-teal-300 ring-offset-1" : ""}`} disabled={!catalogReady || busy || Boolean(sheet) || missingTotal > 0 || (!selected.length && !unmatched.length && !importedLines.length)} onClick={() => importedLines.length ? setSaveReview(true) : void save()} title={missingTotal ? `단위 빈 칸 ${missingTotal}개를 먼저 채워 주세요` : undefined} type="button">{busy ? "저장 중…" : `③ 저장 (${selected.length + unmatched.length}건)`}</button>
        <button className="maju-button-secondary h-9 px-2.5 text-xs" onClick={exportTemplate} type="button">엑셀 양식</button>
      </div>
      <p className="text-xs font-semibold text-slate-500">{sheet ? "② 표 맨 위에서 열마다 항목을 확인하고 '열 정렬'을 누르세요." : missingTotal ? `새 상품 ${missingTotal}개에 단위가 비어 있습니다. 단위를 채운 뒤 저장할 수 있습니다.` : unmatched.length || selected.length ? "③ 확인했으면 저장하세요. 새 상품은 상품관리에 등록되고 매입 이력이 쌓입니다." : "같은 품목은 이름·규격으로 맞춰 새로 만들지 않습니다. 저장한 매입은 '매입 이력' 탭에서 날짜별로 볼 수 있습니다."}</p>
    </header>
    <input accept=".xls,.xlsx,.csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} ref={fileInput} type="file" />
    {error ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-700">{error} <button className="underline" onClick={() => void load()} type="button">목록 새로고침</button></p> : null}
    {batchEnabled ? <p className="text-xs text-slate-600">선택한 매입가 최대 100건과 판매가 계산을 함께 저장합니다. 새 상품·원문 연결·매입 기록은 별도로 저장됩니다.</p> : null}
    {recalcPending || (pricing?.pendingCount ?? 0) > 0 ? <button className="maju-button-secondary" disabled={busy} onClick={() => void retryRecalculation()} type="button">판매가 다시 계산{pricing?.pendingCount ? ` (${pricing.pendingCount}개)` : ""}</button> : null}
    {message ? <p role="status" className="rounded border border-teal-200 bg-teal-50 p-3">{message}</p> : null}
    {sheet ? <section className="maju-section-card min-w-0 space-y-3 p-3 [&_select]:min-h-11"><PurchaseSheetMapper mapping={mapping} onMapping={next => { setMapping(next); setConflictChoices({}); }} onVatMode={next => { setVatMode(next); setConflictChoices({}); }} sheet={sheet} vatMode={vatMode} /><div className="flex flex-wrap items-center gap-2"><button className="maju-button-primary" disabled={!catalogReady || mapping.name === undefined || mapping.cost === undefined || Boolean(importPreview?.error) || unresolvedConflicts > 0} onClick={applyFile} type="button">열 정렬</button><button className="maju-button-secondary" onClick={() => setSheet(null)} type="button">올리기 취소</button></div></section> : null}
    {importPreview ? <section aria-label="업로드 적용일과 단가 확인" className="maju-section-card min-w-0 space-y-3 p-4">
      <h3 className="font-semibold">적용 날짜·중복 단가 확인</h3>
      <p className="text-sm">{mapping.purchaseDate !== undefined ? "파일의 구매일을 행별 적용일로 사용합니다. 빈 날짜나 잘못된 날짜는 먼저 수정해 주세요." : `구매일 열이 없어 업로드 적용일 ${receiptDate || "(날짜 선택 필요)"}을 사용합니다.`}</p>
      {importPreview.error ? <p role="alert">{importPreview.error}</p> : <>
        <CommonDataTable<PurchaseImportLine> settingsKey="purchase-upload-dates" filename="매입가_적용일.csv" rowKey={line => String(line.rowNumber)} rows={importPreview.lines}
          columns={[{ key: "rowNumber", label: "원본 행", value: line => line.rowNumber }, { key: "name", label: "품목", value: line => line.name },
            { key: "purchaseDate", label: "적용일", value: line => line.purchaseDate }, { key: "cost", label: "단가(별도)", value: line => line.cost }, { key: "quantity", label: "수량", value: line => line.quantity ?? "-" }]} />
        {importPreview.conflicts.length ? <><p role="status">같은 품목·같은 적용일의 상이 단가 {importPreview.conflicts.length}그룹 · 미선택 {unresolvedConflicts}그룹. 행을 임의로 고르지 않습니다.</p>
          <section aria-label="상이 단가 선택" className="min-w-0"><CommonDataTable<PurchasePriceConflict> settingsKey="purchase-upload-conflicts" filename="매입가_충돌.csv" rowKey={group => group.key} rows={importPreview.conflicts}
            columns={[{ key: "name", label: "품목", value: group => `${group.name} ${group.spec} ${group.unit}` }, { key: "date", label: "적용일", value: group => group.purchaseDate || receiptDate },
              { key: "choice", label: "단가 선택 또는 보류", value: group => conflictChoices[group.key] || "선택 필요", render: group => <select aria-label={`${group.name} ${group.purchaseDate || receiptDate} 적용 단가`} className="maju-input min-h-11 w-full min-w-[220px]" value={conflictChoices[group.key] || ""}
                onChange={event => setConflictChoices(current => ({ ...current, [group.key]: event.target.value }))}>
                <option value="">적용할 행을 선택해 주세요</option><option value="hold">이번 가격 반영 보류</option>
                {group.candidates.map(line => <option key={line.rowNumber} value={String(line.rowNumber)}>{line.supplier || "매입처 미지정"} · {line.rowNumber}행 · {money(line.cost)} · 수량 {line.quantity ?? "-"}</option>)}
              </select> }]} /></section>
        </> : <p>같은 품목·같은 적용일의 상이 단가가 없습니다.</p>}
      </>}
    </section> : null}
    {importedLines.length ? <section aria-label="저장 전 적용일 확인" className="maju-section-card space-y-3 p-4">
      <p>원본 거래 {importedLines.length}행 · 가격 반영 보류 {heldCount}그룹. 원본 거래는 선택·보류와 별도로 보관합니다.</p>
      <ul>{reviewDates.map(([date, count]) => <li key={date}>{date || "날짜 없음"} · {count}행</li>)}</ul>
      {batchEnabled && priceChangeCount > 100 ? <p role="alert">가격 변경 {priceChangeCount}건은 최대 100건을 초과합니다. 저장 전 선택 건수를 줄여 주세요. 새 상품·이력을 먼저 저장하지 않습니다.</p> : null}
      {dateSaveBlocked ? <p role="status">구매일 기준 저장은 준비 중입니다. 현재 가격일보다 과거인 단가는 현재 매입가에 반영하지 않는 저장 경로가 필요합니다.</p> : null}
      {saveReview ? <>
        <h3 className="font-semibold">최종 저장 확인</h3><p>가격 변경 {priceChangeCount}건 · 새 상품 {unmatched.length}건 · 원본 거래 {importedLines.length}행의 적용 날짜를 확인해 주세요.</p>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={confirmedReview === reviewKey} onChange={event => setConfirmedReview(event.target.checked ? reviewKey : "")} />적용 날짜·건수와 단가 선택·보류 내용을 확인했습니다.</label>
        <div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={busy || confirmedReview !== reviewKey || dateSaveBlocked || (batchEnabled && priceChangeCount > 100)} onClick={() => void save()}>확인한 날짜로 저장</Button>
          <Button className="min-h-11" variant="outline" onClick={() => setSaveReview(false)}>계속 확인하기</Button></div>
      </> : null}
    </section> : null}
    {selected.length && tab !== "신규" ? <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600"><span>선택 {selected.length}개 단가 기준</span><button className="maju-button-secondary h-8 px-2.5 text-xs" disabled={busy} onClick={() => setVatIncluded(selected, true)} type="button">부가세 포함으로</button><button className="maju-button-secondary h-8 px-2.5 text-xs" disabled={busy} onClick={() => setVatIncluded(selected, false)} type="button">부가세 별도로</button><span className="font-semibold text-slate-400">저장되는 매입가는 항상 부가세 별도 금액입니다.</span></div> : null}
    <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">영향받는 문서</h2><p className="text-sm text-slate-600">확정 전에는 문서와 가격이 바뀌지 않습니다. 저장된 변경은 서버 이력으로 확인합니다. 다시 계산한 초안도 새 버전을 게시할 때까지 표시를 유지합니다.</p><div className="flex flex-wrap gap-2">{documentError ? <span role="alert">{documentError} <button className="underline" type="button" onClick={() => void load().catch(cause => setError(String(cause)))}>다시 시도</button></span> : affected.length ? affected.map(({ document, count, changed }) => <Link className="rounded border p-2 text-sm" href="/revenue/pricing/documents" key={document.id}>{document.content.kind === "sheet" ? "단가표" : "견적서"} · {document.content.title} · {changed ? `${changed}개 품목 다시 계산 필요` : `${count}개 품목 변경 후보`}{changed && count ? ` · 후보 ${count}개` : ""}</Link>) : <span className="text-sm text-slate-500">다시 계산할 문서나 변경 후보와 연결된 문서가 없습니다.</span>}</div></section>
    <nav aria-label="매입가 보기" className="flex flex-wrap gap-2">{["변동 있음", "인상", "인하", "신규", "전체", "매입 이력"].map((name) => <button aria-pressed={tab === name} className={tab === name ? "maju-button-primary" : "maju-button-secondary"} key={name} onClick={() => setTab(name)} type="button">{name}{name === "변동 있음" ? ` ${changeCounts.changed}` : name === "인상" ? ` ${changeCounts.up}` : name === "인하" ? ` ${changeCounts.down}` : name === "신규" ? ` ${unmatched.length || recentNew.length}${missingTotal ? ` · 단위 빈 칸 ${missingTotal}` : ""}${suspectCount ? ` · 중복 의심 ${suspectCount}` : ""}` : ""}</button>)}</nav>
    {historyError ? <p className="text-sm text-amber-800" role="alert">{historyError}</p> : null}
    {tab !== "매입 이력" ? <div className="flex flex-wrap items-center gap-2"><select aria-label="매입처" className="maju-input min-h-11" onChange={(event) => setSupplier(event.target.value)} value={supplier}><option value="">매입처 전체</option>{Array.from(new Set(products.map((product) => product.supplierName).filter((name): name is string => Boolean(name)))).map((name) => <option key={name} value={name}>{name}</option>)}</select><select aria-label="바꾼 방법" className="maju-input min-h-11" onChange={(event) => setMethod(event.target.value)} value={method}><option value="">바꾼 방법 전체</option><option>직접</option><option>엑셀</option><option>매입처</option><option>매입 이력</option></select><input aria-label="품목 검색" className="maju-input min-h-11" onChange={(event) => setSearch(event.target.value)} placeholder="품목·코드 검색" value={search} /><button aria-pressed={emptyOnly || (tab === "신규" && newFilter === "unit")} className="maju-button-secondary min-h-11" onClick={() => { if (missingTotal) { setEmptyOnly(false); openFilter("unit"); } else { setEmptyOnly((value) => !value); setTab("전체"); } }} type="button">단위 빈 칸 {missingTotal + unique.filter((product) => !product.unit).length}개 채우기</button></div> : null}
    {tab !== "매입 이력" && tab !== "신규" ? <p className="text-xs text-slate-600">변경 후 매입가는 업로드한 값입니다. 잘못 읽힌 값은 이 칸에서 고치고 저장하세요. 후보가 없는 품목은 현재가를 유지하며, 직접 수정 버튼으로 바꿀 수 있습니다. 변동이 없으면 –로 표시합니다.</p> : null}
    {tab === "매입 이력" ? <PurchaseHistoryPanel companyId={companyId} refreshKey={historyKey} /> : tab === "신규" && unmatched.length ? <section className="maju-section-card min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">새 상품 {unmatched.length}개{missingTotal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">단위 빈 칸 {missingTotal}개</span> : null}{suspectCount ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-700">중복 의심 {suspectCount}개</span> : null}</h2>
          <p className="text-sm text-slate-600">상품명 옆에 섞인 규격·단위를 나눠 두었습니다. 단위는 꼭 채우고(규격은 비워도 됨), <b>중복 의심</b>은 기존 상품에 연결하거나 &lsquo;새 상품&rsquo;으로 확정하세요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">

          <label className="text-xs font-bold text-slate-600">매입처 <input aria-label="새 상품 매입처명" className="maju-input ml-1 h-9 w-36" onChange={(event) => setNewSupplier(event.target.value)} placeholder="비우면 기본 매입처" value={newSupplier} /></label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="새 상품 필터">
        {([["all", `전체 ${unmatched.length}`], ["unit", `단위 빈 칸 ${missingTotal}`], ["suspect", `중복 의심 ${suspectCount}`]] as const).map(([kind, label]) => (
          <button aria-selected={newFilter === kind} className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ring-inset ${newFilter === kind ? (kind === "unit" ? "bg-amber-500 text-white ring-amber-500" : kind === "suspect" ? "bg-rose-600 text-white ring-rose-600" : "bg-teal-700 text-white ring-teal-700") : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`} key={kind} onClick={() => openFilter(kind)} role="tab" type="button">{label}</button>
        ))}
        {newFilter === "unit" && filterIds ? <span className="text-xs font-semibold text-slate-500">엔터를 누르면 다음 빈 칸으로 이동합니다 · {unmatched.filter((row) => filterIds.includes(row.rowId) && !missingFields(row).length).length}/{filterIds.length} 완료{missingTotal ? "" : " · 모두 채웠습니다. 위 ③ 저장을 누르세요"}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
        <span>단위 일괄 입력</span>
        <input aria-label="일괄 입력할 단위" className="maju-input h-8 w-28" list="purchase-unit-options" onChange={(event) => setBulkUnit(event.target.value)} placeholder="EA·BOX·KG" value={bulkUnit} />
        <button className="maju-button-secondary h-8 px-2.5 text-xs" disabled={!rowPick.length} onClick={() => applyBulkUnit("picked")} type="button">선택 {rowPick.length}개에 넣기</button>
        <button className="maju-button-secondary h-8 px-2.5 text-xs" disabled={!missingTotal} onClick={() => applyBulkUnit("empty")} type="button">빈 단위 {missingTotal}개에 모두 넣기</button>
      </div>
      {unmatched.length ? <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[980px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>
        <th className="w-8 px-2 py-2"><input aria-label="새 상품 전체 선택" checked={rowPick.length > 0 && rowPick.length === unmatched.length} onChange={(event) => setRowPick(event.target.checked ? unmatched.map((_, index) => index) : [])} type="checkbox" /></th>
        <th className="px-2 py-2">엑셀 원문</th><th className="px-2 py-2">품목</th><th className="px-2 py-2">규격</th><th className="px-2 py-2">단위 *</th><th className="px-2 py-2 text-right">수량</th><th className="px-2 py-2 text-right">매입가(별도)</th><th className="px-2 py-2">부가세</th><th className="px-2 py-2">과세</th><th className="px-2 py-2">중복 의심</th><th className="px-2 py-2" />
      </tr></thead><tbody>{unmatched.map((row, index) => {
        const suspects = row.notDuplicate ? [] : findDuplicateSuspects(row, unique);
        const twins = unmatched.filter((other, otherIndex) => otherIndex !== index && other.name.replace(/\s+/g, "") === row.name.replace(/\s+/g, "")).length;
        if (newFilter !== "all" && filterIds && !filterIds.includes(row.rowId)) return null;
        return <tr className={`border-t border-slate-100 align-top ${missingFields(row).length ? "bg-amber-50/60" : suspects.length ? "bg-rose-50/40" : ""}`} key={`${row.rawName}-${index}`}>
          <td className="px-2 py-1.5"><input aria-label={`${row.name} 선택`} checked={rowPick.includes(index)} onChange={() => setRowPick((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} type="checkbox" /></td>
          <td className="max-w-[180px] truncate px-2 py-2 text-slate-400" title={row.rawName}>{row.rawName || "-"}</td>
          <td className="px-2 py-1.5"><input aria-label={`${index + 1}행 품목`} className="h-8 w-full rounded-md border bg-white px-2 text-xs font-semibold min-w-[170px] border-slate-200" onChange={(event) => updateNewRow(index, { name: event.target.value })} value={row.name} />{twins ? <p className="mt-0.5 text-[10px] font-bold text-rose-600">파일 안에 같은 이름 {twins}개 더 있음(규격·단위 다름)</p> : null}</td>
          <td className="px-2 py-1.5"><input aria-label={`${index + 1}행 규격`} className="h-8 w-full rounded-md border bg-white px-2 text-xs font-semibold min-w-[90px] border-slate-200" onChange={(event) => updateNewRow(index, { spec: event.target.value })} placeholder="없으면 비움" value={row.spec} /></td>
          <td className="px-2 py-1.5"><input aria-label={`${index + 1}행 단위`} className={`h-8 w-full rounded-md border bg-white px-2 text-xs font-semibold min-w-[70px] ${!row.unit.trim() ? "border-amber-400" : "border-slate-200"}`} data-unit-input list="purchase-unit-options" onChange={(event) => updateNewRow(index, { unit: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusNextEmptyUnit(event.currentTarget); } }} placeholder="EA·BOX·KG" value={row.unit} />{newFilter === "unit" ? <div className="mt-1 flex flex-wrap gap-0.5">{quickUnits.map((unit) => <button className={`rounded px-1.5 py-0.5 text-[10px] font-black ${row.unit === unit ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-teal-50"}`} key={unit} onClick={(event) => { const cell = event.currentTarget.closest("td")?.querySelector<HTMLInputElement>("input[data-unit-input]"); updateNewRow(index, { unit }); window.setTimeout(() => focusNextEmptyUnit(cell), 30); }} type="button">{unit}</button>)}</div> : null}</td>
          <td className="px-2 py-2 text-right">{row.quantity != null ? row.quantity.toLocaleString("ko-KR") : "-"}</td>
          <td className="px-2 py-1.5"><input aria-label={`${index + 1}행 매입가`} className="h-8 w-full rounded-md border bg-white px-2 text-xs font-semibold min-w-[90px] border-slate-200 text-right" min="0" onChange={(event) => updateNewRow(index, { cost: Number(event.target.value), rawCost: Number(event.target.value), vatIncluded: false })} type="number" value={row.cost} /></td>
          <td className="px-2 py-1.5"><button className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.vatIncluded ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`} disabled={busy} onClick={() => { const raw = row.rawCost ?? row.cost; updateNewRow(index, { cost: costExcludingVat(raw, !row.vatIncluded), rawCost: raw, vatIncluded: !row.vatIncluded }); }} type="button">{row.vatIncluded ? "포함" : "별도"}</button></td>
          <td className="px-2 py-1.5"><select aria-label={`${index + 1}행 과세`} className="h-8 w-full rounded-md border bg-white px-2 text-xs font-semibold border-slate-200" onChange={(event) => updateNewRow(index, { taxType: (event.target.value || undefined) as NewRow["taxType"] })} value={row.taxType || ""}><option value="">미정</option><option value="taxable">과세</option><option value="exempt">면세</option></select></td>
          <td className="min-w-[240px] px-2 py-1.5">{suspects.length ? <div className="space-y-1">{suspects.map((suspect) => <div className="rounded-md border border-rose-200 bg-white px-2 py-1" key={suspect.productId}>
            <p className="font-bold text-slate-800">{suspect.name}<span className="ml-1 font-semibold text-slate-500">{[suspect.spec, suspect.unit].filter(Boolean).join(" · ")}</span></p>
            <p className="text-[10px] font-semibold text-rose-700">{suspect.reason}</p>
            <div className="mt-1 flex flex-wrap gap-1"><button className="rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-black text-white" onClick={() => linkNewRow(index, suspect.productId, false)} type="button">이 상품으로 연결</button><button className="rounded border border-teal-600 px-1.5 py-0.5 text-[10px] font-black text-teal-700" onClick={() => linkNewRow(index, suspect.productId, true)} title="기존 상품의 품목명·규격·단위를 이 줄 값으로 바꿉니다" type="button">연결 + 상품 정보 변경</button></div>
          </div>)}<button className="text-[10px] font-bold text-slate-500 underline" onClick={() => updateNewRow(index, { notDuplicate: true })} type="button">새 상품 맞음</button></div> : <span className="text-slate-300">-</span>}</td>
          <td className="px-2 py-1.5 text-right"><button aria-label={`${row.name} 빼기`} className="rounded px-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => { setUnmatched((current) => current.filter((_, rowIndex) => rowIndex !== index)); setRowPick([]); }} type="button">×</button></td>
        </tr>;
      })}</tbody></table></div> : <p className="text-sm text-slate-500">새 상품이 없습니다.</p>}
      <Link className="text-xs font-bold text-teal-700 underline" href="/revenue/products">상품관리에서 전체 상품 보기</Link>
    </section> : <CommonDataTable columns={columns} emptyMessage={tab === "신규" ? "최근 30일에 등록된 상품이 없습니다. 엑셀을 올려 새 상품을 등록해 주세요." : "상품이 없습니다. 엑셀을 올리거나 상품관리에서 상품을 등록해 주세요."} filename="매입가_변경후보.csv" rowKey={(row) => row.id} rows={tab === "신규" ? recentNew : displayed} settingsKey={`purchase-cost:v2:${companyId}`} />}
    <div className="flex flex-wrap items-center gap-3 text-sm"><span>상품 {tab === "신규" ? recentNew.length : displayed.length}개 · 현재 합 {money((tab === "신규" ? recentNew : displayed).reduce((sum, row) => sum + row.cost, 0))} · 변경 후 합 {money((tab === "신규" ? recentNew : displayed).reduce((sum, row) => sum + (candidates[row.id]?.cost ?? row.cost), 0))}</span><button className="maju-button-secondary" disabled={busy || !(batchEnabled && latestBatch && !latestBatch.restoredAt) && !undo} onClick={() => void restore()} type="button">{batchEnabled && latestBatch && !latestBatch.restoredAt ? "직전 매입가·판매가 함께 되돌리기" : "직전 저장 되돌리기 (현재 화면)"}</button><Link className="text-teal-700 underline" href="/revenue/pricing/margins">마진 그룹 설정</Link></div>
    <p className="text-sm text-slate-600">직접 정한 판매가는 그대로 두고, 마진으로 계산하는 상품만 판매가를 다시 계산합니다. 저장 전 후보는 새로고침하면 사라집니다. {batchEnabled ? "원자적으로 저장한 직전 매입가·판매가는 새로고침 뒤에도 함께 되돌릴 수 있습니다." : "매입가 되돌리기는 저장한 화면에서만 가능하며, 새로고침 뒤에는 매입 이력에서 정정해 주세요."}</p>
  </div>;
}
