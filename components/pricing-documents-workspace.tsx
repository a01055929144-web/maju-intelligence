"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { documentRequest } from "@/lib/pricing/document-client";
import {
  koreaDay,
  lineFromCatalog,
  MAX_DOCUMENT_LINES,
  parseDocument,
  withMargin,
  type CatalogChoice,
  fillBlankDocumentSpecs,
  documentDisplayPrice,
  documentOutput,
  refreshedDocumentVersion,
  type DocumentContent,
  type DocumentDraft,
  type DocumentKind,
  type DocumentVersion,
  type PrintLine,
  type ProductSet,
  type Promotion,
  withLivePromotions,
} from "@/domains/pricing/document";
import { PricingDocumentPreview } from "./pricing-document-preview";
import { Button } from "./ui/button";
import { PricingDocPaper } from "./pricing-doc-paper";
import { PricingProductPicker } from "./pricing-product-picker";
import { PricingInfoPanel } from "./pricing-info-panel";
import { PricingStartGallery } from "./pricing-start-gallery";
import { applyPreset, type DocumentPreset } from "@/domains/pricing/document-presets";
import { PricingDocumentLibrary } from "./pricing-document-library";
import { PricingDocumentSheets } from "./pricing-document-sheets";
import { importDocumentExcelRows, parseDocumentExcelRows } from "@/domains/pricing/document-excel";
import { customerErpCode } from "@/domains/product/customer-erp-code";
import type { LeadDocumentContext } from "@/application/pricing/document-entry";
import { PricingLeadDocumentShare } from "./pricing-lead-document-share";
const box = "rounded border border-slate-300 px-3 py-2";
type Profile = {
  revision: number;
  content: { companyName: string; contact: string; footer: string };
};
export function PricingDocumentsWorkspace({
  companyId,
  manager,
  storeLinksEnabled = false,
  initialStartKind,
  leadContext,
  sharingEnabled = false,
  publicSharingAvailable = false,
}: {
  companyId: string;
  manager: boolean;
  storeLinksEnabled?: boolean;
  initialStartKind?: DocumentKind;
  leadContext?: LeadDocumentContext;
  sharingEnabled?: boolean;
  publicSharingAvailable?: boolean;
}) {
  const [docs, setDocs] = useState<DocumentDraft[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [draft, setDraft] = useState<DocumentDraft | null>(null),
    [dirty, setDirty] = useState(false),
    [versions, setVersions] = useState<DocumentVersion[]>([]),
    [preview, setPreview] = useState<DocumentVersion | null>(null),
    [fontScale, setFontScale] = useState(1);
  const [catalog, setCatalog] = useState<CatalogChoice[]>([]),
    [catalogQuery, setCatalogQuery] = useState(""),
    [catalogInput, setCatalogInput] = useState(""),
    [catalogPage, setCatalogPage] = useState(1),
    [catalogTotal, setCatalogTotal] = useState(0);
  const [sets, setSets] = useState<ProductSet[]>([]),
    [promotions, setPromotions] = useState<Promotion[]>([]),
    [profile, setProfile] = useState<Profile>({
      revision: 0,
      content: { companyName: "", contact: "", footer: "" },
    });
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("documents");
  const [view, setView] = useState<"list" | "editor">("list");
  /* 11/4: 같은 데이터를 문서(A4 종이)로 보거나 표로 봅니다. 기본은 문서 보기. */
  const [docView, setDocView] = useState<"doc" | "table">("doc"),
    [autoPrint, setAutoPrint] = useState(false),
    [starting, setStarting] = useState<DocumentKind | null>(initialStartKind ?? null),
    [picked, setPicked] = useState<Set<string>>(new Set());
  const lineKey = (l: PrintLine) => `${l.productId}:${l.promotionId}`;
  // 11/4: 왼쪽 메뉴 '행사·템플릿'·'인쇄 기본값'에서 바로 열기(?tab=library|profile)
  const requestedTab = useSearchParams()?.get("tab") || "";
  useEffect(() => {
    if (!initialStartKind && (requestedTab === "library" || requestedTab === "profile")) { setTab(requestedTab); setView("editor"); }
    else { setTab("documents"); setView("list"); }
  }, [requestedTab, initialStartKind]);
  const [bulkMargin, setBulkMargin] = useState("12"),
    [baselines, setBaselines] = useState<Record<string, number>>({});
  const excelInput = useRef<HTMLInputElement>(null);
  const draggedLine = useRef<number | null>(null);
  const read = useCallback(
    <T,>(action: string, payload: Record<string, unknown> = {}) =>
      documentRequest<T>(companyId, action, payload).then((r) => r.result),
    [companyId],
  );
  const loadList = useCallback(async () => {
    const r = await read<{ items: DocumentDraft[]; total: number }>("list", {
      page,
      search,
    });
    setDocs(r.items);
    setTotal(r.total);
  }, [read, page, search]);
  const loadLibrary = useCallback(async () => {
    const [s, p, h] = await Promise.all([
      read<ProductSet[]>("sets"),
      read<Promotion[]>("promotions"),
      read<Profile>("profile"),
    ]);
    setSets(s);
    setPromotions(p);
    setProfile(h);
  }, [read]);
  async function task(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    void loadList()
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "목록을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [loadList]);
  useEffect(() => {
    void loadLibrary().catch((e) =>
      setError(
        e instanceof Error ? e.message : "기본값을 불러오지 못했습니다.",
      ),
    );
  }, [loadLibrary]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function change(content: DocumentContent) {
    if (draft && !draft.archivedAt) {
      setDraft({ ...draft, content });
      setDirty(true);
      setPreview(null);
    }
  }
  function rows(lines: PrintLine[]) {
    if (draft) change({ ...draft.content, lines });
  }
  function discard() {
    return !dirty || window.confirm("저장하지 않은 변경을 버리고 이동할까요?");
  }
  function blankContent(kind: DocumentKind): DocumentContent {
    return {
      kind,
      title: kind === "sheet" ? "단가표" : "식자재 견적서",
      ...profile.content,
      recipient: leadContext?.name.slice(0, 100) || "",
      validUntil: koreaDay(new Date(Date.now() + 14 * 86400000)),
      theme: "blue",
      layout: "auto",
      showPrice: true,
      showBrand: true,
      showSpec: true,
      lines: [],
    };
  }
  function startPreset(preset: DocumentPreset, kind: DocumentKind) {
    setStarting(null);
    create(kind, applyPreset(blankContent(kind), preset));
  }
  async function startTemplate(set: ProductSet, kind: DocumentKind) {
    const r = await read<{ items: CatalogChoice[] }>("catalog", { productIds: set.productIds });
    if (!r.items.length) throw new Error("템플릿 품목이 비활성 상태입니다. 상품 설정을 확인해 주세요.");
    const byId = new Map(r.items.map((i) => [i.id, i]));
    const lines = set.productIds.map((id) => byId.get(id)).filter((i): i is CatalogChoice => Boolean(i)).map(lineFromCatalog);
    setStarting(null);
    create(kind, { ...blankContent(kind), title: set.name.slice(0, 100), lines });
    if (lines.length < set.productIds.length) setMessage(`${set.productIds.length - lines.length}개 품목은 비활성이라 빠졌습니다.`);
  }
  const loadPrices = useCallback(
    (ids: string[]) => read<{ items: CatalogChoice[] }>("catalog", { productIds: ids.slice(0, 100) }).then((r) => r.items),
    [read],
  );
  async function fillMissingSpecs() {
    if (!draft) return;
    const ids = Array.from(new Set(draft.content.lines.filter((line) => !(line.spec || "").trim()).map((line) => line.productId)));
    if (!ids.length) return;
    const products = await read<{ items: CatalogChoice[] }>("catalog", { productIds: ids });
    const updated = fillBlankDocumentSpecs(draft.content.lines, products.items);
    rows(updated);
    setMessage(`원장 규격 ${updated.filter((line, index) => (line.spec || "").trim() && !(draft.content.lines[index].spec || "").trim()).length}개를 채웠습니다. 확인 후 저장해 주세요.`);
  }
  const quickSearch = useCallback(
    (query: string) => read<{ items: CatalogChoice[]; total: number }>("catalog", { search: query, page: 1 }).then((r) => r.items),
    [read],
  );
  const loadStartDocuments = useCallback(
    () => read<{ items: DocumentDraft[]; total: number }>("list", { page: 1, search: "" }).then((r) => r.items),
    [read],
  );
  function create(kind: DocumentKind, content?: DocumentContent) {
    if (!discard()) return;
    const basis: Record<string, number> = {};
    for (const l of content?.lines || []) basis[l.productId] = l.price;
    setBaselines(basis);
    setDraft({
      id: crypto.randomUUID(),
      revision: 0,
      updatedAt: "",
      content: content
        ? { ...structuredClone(content), kind, recipient: leadContext?.name.slice(0, 100) ?? content.recipient }
        : blankContent(kind),
    });
    setDirty(true);
    setPreview(null);
    setVersions([]);
    setTab("documents");
    setView("editor");
    setTab("documents");
  }
  async function select(d: DocumentDraft) {
    if (!discard()) return;
    setVersions([]);
    setDraft(structuredClone(d));
    setDirty(false);
    setPreview(null);
    setVersions((await read<DocumentVersion[]>("versions", { id: d.id })).filter(v => v.documentId === d.id));
    const products = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: Array.from(new Set(d.content.lines.map((l) => l.productId))),
    });
    const basis: Record<string, number> = {};
    for (const p of products.items) basis[p.id] = p.price;
    setBaselines(basis);
    setView("editor");
    setTab("documents");
  }
  async function save() {
    if (!draft || draft.archivedAt) return;
    const content = parseDocument(draft.content);
    const r = await documentRequest<DocumentDraft>(
      companyId,
      "save",
      { id: draft.id, expected: draft.revision, content },
      true,
    );
    setDraft(r.result);
    setDirty(false);
    setMessage("초안을 저장했습니다.");
    await loadList();
  }
  async function publish() {
    if (!draft || draft.archivedAt || dirty) return;
    const r = await documentRequest<DocumentVersion>(
      companyId,
      "publish",
      { id: draft.id, expected: draft.revision },
      true,
    );
    // 11/4: 확정 후 미리보기 창을 자동으로 띄우지 않습니다(필요할 때 '미리보기·인쇄' 또는 버전 미리보기).
    setVersions(await read<DocumentVersion[]>("versions", { id: draft.id }));
    setMessage(`버전 ${r.result.version}을 확정했습니다. 아래 '버전 ${r.result.version} 미리보기'에서 인쇄할 수 있습니다.${leadContext ? " 작성·게시만 완료됐으며 리드에게 전달하지 않았습니다." : ""}`);
  }
  useEffect(() => {
    let active = true;
    void read<{ items: CatalogChoice[]; total: number }>("catalog", {
      search: catalogQuery,
      page: catalogPage,
    })
      .then((r) => {
        if (active) {
          setCatalog(r.items);
          setCatalogTotal(r.total);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "품목을 불러오지 못했습니다.",
          );
      });
    return () => {
      active = false;
    };
  }, [read, catalogQuery, catalogPage]);
  function add(items: CatalogChoice[]) {
    if (!draft) return;
    setBaselines((previous) => {
      const next = { ...previous };
      for (const i of items) next[i.id] = i.price;
      return next;
    });
    const keys = new Set(
      draft.content.lines.map((l) => `${l.productId}:${l.promotionId}`),
    );
    const appended = items
      .filter((i) => !keys.has(`${i.id}:null`))
      .map(lineFromCatalog);
    if (draft.content.lines.length + appended.length > MAX_DOCUMENT_LINES)
      throw new Error(`문서당 최대 ${MAX_DOCUMENT_LINES}개 품목을 담을 수 있습니다.`);
    rows([...draft.content.lines, ...appended]);
  }
  async function loadSet(s: ProductSet) {
    const r = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: s.productIds,
    });
    if (r.items.length !== s.productIds.length)
      throw new Error("활성 상품·노출 상품명 설정을 확인해 주세요.");
    const byId = new Map(r.items.map((i) => [i.id, i]));
    add(s.productIds.map((id) => byId.get(id)!));
    setTab("documents");
  }
  async function addPromotion(p: Promotion) {
    if (!draft) throw new Error("먼저 문서를 작성해 주세요.");
    if (draft.content.kind === "sheet" && !p.allowSheet)
      throw new Error("이 행사는 견적서에만 넣을 수 있습니다.");
    if (draft.content.lines.some((l) => l.promotionId === p.id)) return;
    const r = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: [p.productId],
    });
    if (!r.items[0]) throw new Error("행사 상품을 확인해 주세요.");
    setBaselines((previous) => ({
      ...previous,
      [p.productId]: r.items[0].price,
    }));
    rows([
      ...draft.content.lines,
      {
        ...lineFromCatalog(r.items[0]),
        displayName: p.displayName,
        price: p.price,
        promotionId: p.id,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        remaining: p.stock,
        badge: p.badge,
        taxType: p.taxType,
      },
    ]);
    setTab("documents");
  }
  useEffect(() => { setPicked(new Set()); }, [draft?.id]);
  function bulkRows(update: (line: PrintLine) => PrintLine | null) {
    if (!draft) return;
    rows(draft.content.lines.flatMap((l) => {
      if (!picked.has(lineKey(l))) return [l];
      const next = update(l);
      return next ? [next] : [];
    }));
  }
  async function applyMargin(index?: number, only?: Set<string>) {
    if (!draft || !draft.content.lines.length) return;
    const ids = Array.from(
      new Set(
        draft.content.lines
          .filter((l) => !l.promotionId)
          .map((l) => l.productId),
      ),
    );
    const r = await read<{ items: CatalogChoice[] }>("catalog", {
      productIds: ids,
    });
    const byId = new Map(r.items.map((i) => [i.id, i]));
    const entered =
      index === undefined
        ? bulkMargin
        : window.prompt("마진율(매입가 대비) 0~1000%", bulkMargin);
    if (entered === null) return;
    const rate = Number(entered);
    rows(
      draft.content.lines.map((l, i) => {
        if (l.promotionId || (index !== undefined && i !== index) || (only && !only.has(lineKey(l)))) return l;
        const item = byId.get(l.productId);
        if (item?.cost === undefined)
          throw new Error("매입가 확인 권한이 필요합니다.");
        return withMargin(l, item.cost, rate);
      }),
    );
  }
  function move(i: number, delta: number) {
    if (!draft) return;
    const next = [...draft.content.lines],
      j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    rows(next);
  }
  function dropLine(target: number) {
    if (!draft || draggedLine.current === null) return;
    const source = draggedLine.current;
    draggedLine.current = null;
    if (source === target) return;
    const next = [...draft.content.lines];
    next.splice(target, 0, next.splice(source, 1)[0]);
    rows(next);
  }
  async function refreshPreview(selected: DocumentVersion) {
    if (selected.id.startsWith("preview-")) return withLivePromotions(selected, await read<Promotion[]>("promotions"));
    const list = await read<DocumentVersion[]>("versions", { id: selected.documentId });
    const found = list.find(v => v.id === selected.id);
    if (!found) throw new Error("버전을 다시 선택해 주세요.");
    return refreshedDocumentVersion(selected, found);
  }
  async function exportLines(selected?: DocumentVersion) {
    if (!draft && !selected) return;
    const XLSX = await import("xlsx");
    let sheet, title: string;
    if (selected) {
      const output = documentOutput(await refreshPreview(selected));
      sheet = XLSX.utils.json_to_sheet(output.lines.map(line => ({
        "품목명": line.displayName, "규격": line.spec, "단위": line.unit, "판매가": line.price,
        "과세": line.taxType === "taxable" ? "과세" : "면세",
      })));
      title = `${output.title}-v${selected.version}`;
    } else {
      const content = draft!.content;
      const ids = Array.from(new Set(content.lines.map(line => line.productId)));
      const current = await read<{ items: CatalogChoice[] }>("catalog", { productIds: ids });
      const codes = new Map(current.items.map(item => [item.id, customerErpCode(item.productCode)]));
      sheet = XLSX.utils.json_to_sheet(content.lines.map(line => ({
        "ERP 코드": codes.get(line.productId) || "", "품목명": line.displayName,
        "규격": line.spec, "단위": line.unit, "판매가": line.price,
        "과세": line.taxType === "taxable" ? "과세" : line.taxType === "exempt" ? "면세" : "확인 필요",
      })));
      title = content.title || "품목";
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "품목");
    const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${title}.xlsx`; anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importLines(file: File) {
    if (!draft) return;
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = file.name.toLocaleLowerCase().endsWith(".csv")
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" })
      : XLSX.read(buffer, { type: "array" });
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
    const imported = parseDocumentExcelRows(raw);
    const codes = imported.map((row) => row.code).filter(Boolean);
    const found = new Map(catalog.map((item) => [item.id, item]));
    if (codes.length) {
      const result = await read<{ items: CatalogChoice[] }>("catalog", { productCodes: codes });
      for (const item of result.items) found.set(item.id, item);
    }
    const names = Array.from(new Set(imported.map((row) => row.name).filter(Boolean)));
    for (const name of names) {
      const result = await read<{ items: CatalogChoice[] }>("catalog", { search: name, page: 1 });
      for (const item of result.items) found.set(item.id, item);
    }
    const result = importDocumentExcelRows(imported, Array.from(found.values()), draft.content.lines);
    if (result.added.length) rows([...draft.content.lines, ...result.added]);
    setMessage(`${result.added.length}개 품목을 담았습니다.${result.unmatched.length ? ` 연결되지 않은 ${result.unmatched.length}개: ${result.unmatched.slice(0, 5).join(", ")}` : ""}`);
  }
  const openPreview = (print: boolean) => {
    if (!draft) return;
    void task(async () => {
                        const content = parseDocument(draft.content),
                          p = await read<Promotion[]>("promotions");
                        setAutoPrint(print);
                        setPreview(
                          withLivePromotions(
                            {
                              id: `preview-${draft.id}`,
                              documentId: draft.id,
                              version: 0,
                              revision: draft.revision,
                              publishedAt: new Date().toISOString(),
                              content,
                              unavailablePromotions: [],
                            },
                            p,
                          ),
                        );
                      });
  };
  const editable = Boolean(
    draft && !draft.archivedAt && (draft.content.kind === "quote" || manager),
  );
  const leadNotice = leadContext ? <aside className="pricing-no-print flex flex-wrap items-center gap-2 rounded border p-3 text-sm" aria-label="리드 문서 작성 문맥">
    <p className="mr-auto">{leadContext.name} · {sharingEnabled ? "작성·게시는 전달이 아닙니다. 게시 버전으로 링크를 준비한 뒤 실제 전달을 별도로 기록해 주세요." : "작성·게시 전용입니다. 공개 링크 준비 전이며 아직 전달되지 않았습니다."}</p>
    <a className="inline-flex min-h-[44px] items-center rounded border px-3" href={leadContext.backHref} onClick={event => { if (!discard()) event.preventDefault(); }}>리드 상세로 돌아가기</a>
  </aside> : null;
  if (view === "list" && tab === "documents") return <div className="space-y-3">
    {leadNotice}
    {/* 11/4: 행사·묶음·템플릿과 인쇄 기본값은 목록 위 버튼으로(편집 화면을 단순하게) */}
    <div className="flex flex-wrap justify-end gap-2">
      <button className="maju-button-secondary h-9 px-3 text-xs" onClick={() => { setTab("library"); setView("editor"); }} type="button">행사·묶음·템플릿</button>
      <button className="maju-button-secondary h-9 px-3 text-xs" onClick={() => { setTab("profile"); setView("editor"); }} type="button">인쇄 기본값</button>
    </div>
    <PricingDocumentSheets companyId={companyId} manager={manager}
      onCreate={(kind) => setStarting(kind)} onOpen={select}
      onCopy={(document) => create(document.content.kind, document.content)} />
    {error ? <p className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p> : null}
    {starting ? <PricingStartGallery kind={starting} loadDocuments={loadStartDocuments} manager={manager} onBlank={(kind) => { setStarting(null); create(kind); }} onClose={() => setStarting(null)} onCopy={(document, kind) => { setStarting(null); create(kind, document.content); }} onPreset={startPreset} onTemplate={(set, kind) => void task(() => startTemplate(set, kind))} sets={sets} /> : null}
  </div>;
  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-clip" aria-busy={busy}>
      {leadNotice}
      <header className="pricing-no-print sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-1 py-2 backdrop-blur">
        <button className={box} onClick={() => { if (discard()) { setView("list"); setTab("documents"); void loadList(); } }} type="button">← 문서 목록</button>
        {draft && tab === "documents" ? (
          <>
            <input aria-label="문서 제목" className="h-9 min-w-[160px] flex-1 rounded-md border border-transparent px-2 text-lg font-bold hover:border-slate-200 focus:border-teal-400" disabled={!editable} maxLength={100} onChange={(e) => change({ ...draft.content, title: e.target.value })} value={draft.content.title} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {draft.content.kind === "sheet"
                      ? "단가표"
                      : "작성자 전용 견적서"}{" "}
                    ·{" "}
                    {dirty ? "저장 안 된 변경 있음" : `저장 ${draft.revision}`}
                  </span>
                  <button
                    disabled={
                      busy ||
                      !editable ||
                      draft.content.lines.some((l) => l.taxType === "unknown")
                    }
                    onClick={() => void task(save)}
                    className={box}
                  >
                    초안 저장
                  </button>
                  <button
                    disabled={busy || dirty || !draft.revision || !editable}
                    onClick={() => void task(publish)}
                    className={`${box} bg-blue-700 text-white`}
                  >
                    판매가 버전 확정
                  </button>
                  <button disabled={busy} className={box} onClick={() => openPreview(false)} type="button">미리보기</button>
                  <Button disabled={busy} className="bg-slate-900 text-white" onClick={() => openPreview(true)}>A4 인쇄</Button>
                  <span className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="보기 방식">
                    {([["doc", "문서 보기"], ["table", "표 보기"]] as const).map(([value, label]) => <button aria-pressed={docView === value} className={`h-9 px-3 text-sm font-bold ${docView === value ? "bg-teal-700 text-white" : "bg-white text-slate-700"}`} key={value} onClick={() => setDocView(value)} type="button">{label}</button>)}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => create("quote", draft.content)}
                    className={box}
                  >
                    견적서로 복사
                  </button>
                  <button disabled={busy} onClick={() => void task(exportLines)} className={box} type="button">품목 엑셀 내보내기</button>
                  <button disabled={busy || !editable} onClick={() => excelInput.current?.click()} className={box} type="button">품목 엑셀로 담기</button>
                  <input accept=".xlsx,.xls,.csv" className="sr-only" ref={excelInput} type="file" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void task(() => importLines(file));
                    event.target.value = "";
                  }} />
                </div>
          </>
        ) : <h1 className="text-xl font-bold">{tab === "library" ? "행사·묶음·템플릿" : tab === "profile" ? "인쇄 기본값" : "견적서·단가표"}</h1>}
      </header>
      {draft?.archivedAt ? <p role="status" className="rounded border p-3 text-sm">보관된 문서입니다. 내용을 바꾸거나 새 버전을 발행하려면 문서 보관함에서 먼저 복원해 주세요. 기존 발행본과 주문 링크는 유지됩니다.</p> : null}
      {error && (
        <p
          role="alert"
          className="pricing-no-print rounded bg-red-50 p-3 text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="pricing-no-print">
          {message}
        </p>
      )}
      {tab !== "documents" ? <div className="pricing-no-print flex flex-wrap gap-2">
        {[
          ["library", "행사·묶음·템플릿"],
          ["profile", "인쇄 기본값"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`${box} ${tab === id ? "bg-slate-900 text-white" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div> : null}
      {tab === "profile" && (
        <form
          className="pricing-no-print maju-section-card space-y-3 p-4"
          key={profile.revision}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void task(async () => {
              await documentRequest(
                companyId,
                "save-profile",
                {
                  id: companyId,
                  expected: profile.revision,
                  content: {
                    companyName: String(data.get("companyName")),
                    contact: String(data.get("contact")),
                    footer: String(data.get("footer")),
                  },
                },
                true,
              );
              await loadLibrary();
              setMessage("회사 인쇄 기본값을 저장했습니다.");
            });
          }}
        >
          <h2 className="font-bold">회사 인쇄 기본값</h2>
          {(
            [
              ["companyName", "회사명"],
              ["contact", "담당·연락처"],
              ["footer", "마감·배송·최소 주문·시세 안내"],
            ] as const
          ).map(([key, label]) => (
            <label className="block" key={key}>
              {label}
              <input
                name={key}
                disabled={!manager}
                defaultValue={profile.content[key]}
                required={key === "companyName"}
                maxLength={key === "footer" ? 400 : 100}
                className={`${box} ml-2 w-full max-w-xl`}
              />
            </label>
          ))}
          <button disabled={busy || !manager} className={box}>
            기본값 저장
          </button>
          <p className="text-sm">
            새 문서에 적용되며 이미 확정된 버전은 바뀌지 않습니다.
          </p>
        </form>
      )}
      {tab === "library" && (
        <PricingDocumentLibrary
          companyId={companyId}
          manager={manager}
          sets={sets}
          promotions={promotions}
          selectedProductIds={
            draft?.content.lines.map((l) => l.productId) || []
          }
          run={task}
          reload={loadLibrary}
          loadSet={loadSet}
          addPromotion={addPromotion}
          previewPromotion={(version) => setPreview(version)}
          catalog={catalog}
          profile={profile.content}
          busy={busy}
        />
      )}
      {tab === "documents" && (
        <div className="pricing-no-print min-w-0">
          {!draft ? (
            <p className="rounded border p-8">문서를 선택하거나 새로 작성하세요.</p>
          ) : (
            /* 11/4: 문서 목록(왼쪽)은 목록 화면에만 두고, 편집은 가운데 품목 · 오른쪽 문서 설정 두 칸으로 단순화 */
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
                {editable && draft.content.lines.some((line) => !(line.spec || "").trim()) ? <button className="maju-button-secondary min-h-11" disabled={busy} onClick={() => void task(fillMissingSpecs)} type="button">빈 규격 원장에서 채우기</button> : null}
                {versions.some((version) => version.content.lines.some((line) => !(line.spec || "").trim())) ? <p className="text-sm text-slate-600" role="status">기존 발행본의 규격은 그대로 유지됩니다. 초안에서 규격을 확인하고 저장한 뒤 새 버전을 확정해 공유 링크를 다시 발급해 주세요.</p> : null}
                {docView === "doc" ? (
                  <>
                    {draft.content.lines.some((l) => l.taxType === "unknown") ? <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm" role="status">과세 미확정 품목이 있습니다 — <button className="font-bold underline" onClick={() => setDocView("table")} type="button">표 보기</button>에서 과세·면세를 고른 뒤 저장해 주세요.</p> : null}
                    {editable && sets.length ? (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {sets.map((s) => <button className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold" disabled={busy} key={s.id} onClick={() => void task(() => loadSet(s))} type="button">묶음 · {s.name} 담기</button>)}
                      </div>
                    ) : null}
                    <div className={`grid min-w-0 items-start gap-3 ${editable ? "lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]" : ""}`}>
                      {editable ? (
                        <PricingProductPicker
                          added={new Set(draft.content.lines.flatMap((l) => (l.promotionId ? [`promo:${l.promotionId}`] : [l.productId])))}
                          busy={busy}
                          companyId={companyId}
                          loadPrices={loadPrices}
                          manager={manager}
                          onAdd={(items) => void task(async () => add(items))}
                          onAddPromotion={(p) => void task(() => addPromotion(p))}
                          onOpenLibrary={() => window.open("/revenue/pricing/documents?tab=library", "_blank", "noopener")}
                          onRefreshPromotions={() => void task(loadLibrary)}
                          promotions={promotions.filter((p) => koreaDay() >= p.startsOn && koreaDay() <= p.endsOn && p.stock !== 0 && (draft.content.kind === "quote" || p.allowSheet))}
                        />
                      ) : null}
                      <div className="min-w-0 rounded-xl bg-slate-100 p-2 sm:p-5">
                        <PricingDocPaper baselines={baselines} content={draft.content} editable={editable} onContent={change} onQuickAdd={(item) => void task(async () => add([item]))} onQuickSearch={quickSearch} />
                      </div>
                    </div>
                  </>
                ) : (
                <>
                {editable && (
                  <div className="space-y-2 rounded border p-3">
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setCatalogPage(1);
                        setCatalogQuery(catalogInput);
                      }}
                    >
                      <input
                        value={catalogInput}
                        onChange={(e) => setCatalogInput(e.target.value)}
                        placeholder={
                          manager ? "관리 상품명 검색" : "노출 상품명 검색"
                        }
                        aria-label="추가할 품목 검색"
                        className={box}
                        maxLength={100}
                      />
                      <button disabled={busy} className={box}>
                        품목 찾기
                      </button>
                    </form>
                    <div className="max-h-40 overflow-auto">
                      {catalog.map((item) => (
                        <button
                          key={item.id}
                          disabled={busy}
                          onClick={() => void task(async () => add([item]))}
                          className={`${box} m-1 text-left`}
                        >
                          {item.name}
                          {item.taxType === "unknown"
                            ? " (과세 확인 필요)"
                            : ""}{" "}
                          · {item.price.toLocaleString()}원{" "}
                          {manager && item.cost !== undefined
                            ? `(매입 ${item.cost.toLocaleString()}원)`
                            : ""}{" "}
                          +
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={catalogPage <= 1 || busy}
                        onClick={() => setCatalogPage((p) => p - 1)}
                        className={box}
                      >
                        품목 이전
                      </button>
                      <span>
                        {catalogPage} /{" "}
                        {Math.max(1, Math.ceil(catalogTotal / 50))}
                      </span>
                      <button
                        disabled={busy || catalogPage * 50 >= catalogTotal}
                        onClick={() => setCatalogPage((p) => p + 1)}
                        className={box}
                      >
                        품목 다음
                      </button>
                    </div>
                    <p className="text-xs">
                      노출 상품명이 없는 품목은 매장에 보일 이름을 직접 입력해
                      주세요. 관리 상품명은 출력에 자동 사용하지 않습니다.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sets.map((s) => (
                        <button
                          key={s.id}
                          disabled={busy}
                          className={box}
                          onClick={() => void task(() => loadSet(s))}
                        >
                          {s.name} 불러오기
                        </button>
                      ))}
                      {promotions
                        .filter(
                          (p) =>
                            koreaDay() >= p.startsOn &&
                            koreaDay() <= p.endsOn &&
                            p.stock !== 0 &&
                            (draft.content.kind === "quote" || p.allowSheet),
                        )
                        .map((p) => (
                          <button
                            key={p.id}
                            className={box}
                            disabled={busy}
                            onClick={() => void task(() => addPromotion(p))}
                          >
                            {p.badge} {p.displayName} 추가
                          </button>
                        ))}
                    </div>
                    {manager && (
                      <div className="flex gap-2">
                        <label>
                          일괄 마진율(매입가 대비)
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            step="0.01"
                            value={bulkMargin}
                            onChange={(e) => setBulkMargin(e.target.value)}
                            className={`${box} w-24`}
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() => void task(() => applyMargin())}
                          className={box}
                        >
                          일괄 적용
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {draft.content.lines.some((l) => l.taxType === "unknown") && (
                  <p
                    role="status"
                    className="rounded border border-amber-400 bg-amber-50 p-3"
                  >
                    과세 미확정{" "}
                    {
                      draft.content.lines.filter((l) => l.taxType === "unknown")
                        .length
                    }
                    개 — 표의 과세 항목에서 과세·면세를 확인한 후 저장해 주세요.
                  </p>
                )}
                {picked.size && editable ? (
                  <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white" role="toolbar" aria-label="선택한 품목 일괄 변경">
                    <strong className="mr-1">{picked.size}개 선택</strong>
                    <button className="rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20" onClick={() => bulkRows((l) => ({ ...l, visible: true }))} type="button">보이기</button>
                    <button className="rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20" onClick={() => bulkRows((l) => ({ ...l, visible: false }))} type="button">숨기기</button>
                    <button className="rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20" onClick={() => bulkRows((l) => (l.promotionId ? l : { ...l, taxType: "taxable" }))} type="button">과세로</button>
                    <button className="rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20" onClick={() => bulkRows((l) => (l.promotionId ? l : { ...l, taxType: "exempt" }))} type="button">면세로</button>
                    {manager ? <button className="rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20" disabled={busy} onClick={() => void task(() => applyMargin(undefined, picked))} type="button">마진 {bulkMargin}% 적용</button> : null}
                    <button className="rounded bg-rose-500/80 px-2 py-1 font-bold hover:bg-rose-500" onClick={() => { bulkRows(() => null); setPicked(new Set()); }} type="button">빼기</button>
                    <button className="ml-auto rounded px-2 py-1 text-white/80 hover:text-white" onClick={() => setPicked(new Set())} type="button">선택 해제</button>
                  </div>
                ) : null}
                <div className="overflow-auto rounded border">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="w-8 p-2">{editable ? <input aria-label="품목 전체 선택" checked={draft.content.lines.length > 0 && picked.size === draft.content.lines.length} onChange={(e) => setPicked(e.target.checked ? new Set(draft.content.lines.map(lineKey)) : new Set())} type="checkbox" /> : null}</th>
                        {[
                          "순서·표시",
                          "노출 상품명 / 브랜드",
                          "규격·단위",
                          "과세",
                          "판매가",
                          "편집",
                        ].map((t) => (
                          <th key={t} className="p-2">
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.content.lines.map((l, i) => (
                        <tr
                          key={`${l.productId}:${l.promotionId}`}
                          className={`border-t ${picked.has(lineKey(l)) ? "bg-teal-50" : ""} ${l.price < (baselines[l.productId] ?? 0) ? "bg-orange-50 outline outline-1 outline-orange-300" : ""}`}
                          onDragOver={(event) => { if (draggedLine.current !== null) event.preventDefault(); }}
                          onDrop={(event) => { event.preventDefault(); dropLine(i); }}
                        >
                          <td className="p-2">{editable ? <input aria-label={`품목 ${i + 1} 선택`} checked={picked.has(lineKey(l))} onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(lineKey(l)); else next.delete(lineKey(l)); return next; })} type="checkbox" /> : null}</td>
                          <td className="p-2">
                            {editable ? <span aria-hidden="true" className="mr-1 cursor-grab text-slate-500" draggable onDragEnd={() => { draggedLine.current = null; }} onDragStart={() => { draggedLine.current = i; }} title="끌어서 순서 변경">⠿</span> : null}
                            <label>
                              <input
                                disabled={!editable}
                                type="checkbox"
                                checked={l.visible}
                                onChange={(e) =>
                                  rows(
                                    draft.content.lines.map((x, j) =>
                                      j === i
                                        ? { ...x, visible: e.target.checked }
                                        : x,
                                    ),
                                  )
                                }
                              />{" "}
                              {i + 1}
                            </label>
                          </td>
                          <td className="p-2">
                            {l.badge && (
                              <span className="text-amber-800">
                                {l.badge} · {l.endsOn}까지 ·{" "}
                                {l.remaining ?? "재고 미설정"}
                              </span>
                            )}
                            <input
                              aria-label={`품목 ${i + 1} 노출 상품명`}
                              disabled={!editable || !!l.promotionId}
                              value={l.displayName}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, displayName: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              maxLength={120}
                              className={`${box} block w-full`}
                            />
                            <input
                              aria-label={`품목 ${i + 1} 브랜드`}
                              disabled={!editable}
                              value={l.brand}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, brand: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              className={`${box} mt-1 w-full`}
                              maxLength={80}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`품목 ${i + 1} 규격`}
                              disabled={!editable}
                              value={l.spec}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, spec: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              maxLength={80}
                              className={`${box} w-28`}
                            />
                            <input
                              aria-label={`품목 ${i + 1} 단위`}
                              disabled={!editable}
                              value={l.unit}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, unit: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              maxLength={20}
                              className={`${box} mt-1 w-28`}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              disabled={!editable}
                              aria-label={`품목 ${i + 1} 과세`}
                              value={l.taxType}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          taxType: e.target
                                            .value as PrintLine["taxType"],
                                        }
                                      : x,
                                  ),
                                )
                              }
                              className={box}
                            >
                              <option value="unknown">확인 필요</option>
                              <option value="taxable">과세</option>
                              <option value="exempt">면세</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              disabled={!editable || !!l.promotionId}
                              type="number"
                              min="0"
                              max="1000000000000"
                              step="1"
                              value={documentDisplayPrice(l.price, l.taxType, draft.content.display?.priceIncludesTax || false)}
                              aria-label={`품목 ${i + 1} 판매가`}
                              onChange={(e) =>
                                rows(
                                  draft.content.lines.map((x, j) =>
                                    j === i
                                      ? { ...x, price: draft.content.display?.priceIncludesTax && x.taxType === "taxable" ? Math.round(Number(e.target.value) / 1.1) : Number(e.target.value) }
                                      : x,
                                  ),
                                )
                              }
                              className={`${box} w-32`}
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                disabled={!editable || i === 0}
                                onClick={() => move(i, -1)}
                                className={box}
                                aria-label={`품목 ${i + 1} 위로`}
                              >
                                위
                              </button>
                              <button
                                disabled={
                                  !editable ||
                                  i === draft.content.lines.length - 1
                                }
                                onClick={() => move(i, 1)}
                                className={box}
                                aria-label={`품목 ${i + 1} 아래로`}
                              >
                                아래
                              </button>
                              <button
                                disabled={!editable}
                                onClick={() =>
                                  rows(
                                    draft.content.lines.filter(
                                      (_, j) => j !== i,
                                    ),
                                  )
                                }
                                className={box}
                              >
                                삭제
                              </button>
                              {manager && !l.promotionId && (
                                <button
                                  disabled={busy || !editable}
                                  onClick={() =>
                                    void task(() => applyMargin(i))
                                  }
                                  className={box}
                                >
                                  개별 마진
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  {draft.content.lines.length}개 품목 · 기준가보다 낮은 단가는
                  주황색으로 표시합니다. 왼쪽 칸을 체크하면 여러 품목을 한 번에 바꿀 수 있습니다.
                </p>
                </>
                )}
                <div className="flex flex-wrap gap-2">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          const current = await read<DocumentVersion[]>(
                            "versions",
                            { id: v.documentId },
                          );
                          const selected = current.find(
                            (item) => item.id === v.id,
                          );
                          if (!selected)
                            throw new Error("버전을 찾을 수 없습니다.");
                          setPreview(selected);
                        })
                      }
                      className={box}
                    >
                      버전 {v.version} 미리보기 · {v.publishedAt.slice(0, 10)}
                    </button>
                  ))}
                </div>
              </div>
              {docView === "doc" ? <PricingInfoPanel companyId={companyId} content={draft.content} editable={editable} onContent={change} /> : (
              <aside className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 xl:sticky xl:top-24">
                <h2 className="text-sm font-black text-slate-900">문서 설정</h2>
                <div className="grid gap-2">
                  {(
                    [
                      ["title", "문서 제목"],
                      ["companyName", "회사명"],
                      ["contact", "담당·연락처"],
                      ["recipient", "받는 곳"],
                      ["validUntil", "유효기간"],
                      ["footer", "하단 안내"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      {label}
                      <input
                        disabled={!editable}
                        type={key === "validUntil" ? "date" : "text"}
                        value={draft.content[key]}
                        onChange={(e) =>
                          change({ ...draft.content, [key]: e.target.value })
                        }
                        className={`${box} block w-full`}
                        maxLength={key === "footer" ? 400 : 100}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-sm">
                  <label>
                    테마
                    <select
                      disabled={!editable}
                      value={draft.content.theme}
                      onChange={(e) =>
                        change({
                          ...draft.content,
                          theme: e.target.value as DocumentContent["theme"],
                        })
                      }
                      className={box}
                    >
                      <option value="blue">청색</option>
                      <option value="green">녹색</option>
                      <option value="mono">흑백</option>
                    </select>
                  </label>
                  <label>
                    형식
                    <select
                      disabled={!editable}
                      value={draft.content.layout}
                      onChange={(e) =>
                        change({
                          ...draft.content,
                          layout: e.target.value as DocumentContent["layout"],
                        })
                      }
                      className={box}
                    >
                      <option value="auto">자동(20개 초과 표)</option>
                      <option value="table">표형</option>
                      <option value="cards">카드형</option>
                    </select>
                  </label>
                  {(
                    [
                      ["showPrice", "단가"],
                      ["showBrand", "브랜드"],
                      ["showSpec", "규격·단위"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <input
                        disabled={!editable}
                        type="checkbox"
                        checked={draft.content[key]}
                        onChange={(e) =>
                          change({ ...draft.content, [key]: e.target.checked })
                        }
                      />{" "}
                      {label}
                    </label>
                  ))}
                </div>
              </aside>
              )}
            </div>
          )}
        </div>
      )}
      {leadContext && sharingEnabled && draft && versions.some(v => v.documentId === draft.id) ? <PricingLeadDocumentShare key={`${draft.id}:${leadContext.id}`} companyId={companyId} leadId={leadContext.id} documentId={draft.id} versions={versions} onDeliveryRecorded={() => setMessage("리드에게 실제 전달한 기록을 확인했습니다.")} /> : null}
      {preview && (
        /* 11/4: 와이어프레임 ④ — 미리보기는 큰 화면(모달)으로: 온라인(휴대폰)·오프라인(A4) 나란히, 글자 크기, 인쇄·PDF·PNG·엑셀 */
        <div aria-label="미리보기" aria-modal="true" className="pricing-preview-modal fixed inset-0 z-[60] overflow-y-auto bg-slate-100" role="dialog">
          <div className="pricing-no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
            <strong className="mr-auto text-base">{preview.content.kind === "sheet" ? "단가표" : "견적서"} 미리보기 · {preview.content.title}{preview.version ? ` · 버전 ${preview.version}` : " · 작성 중"}</strong>
            <span className="text-xs font-bold text-slate-500">글자 크기</span>
            {[1, 1.15, 1.3].map((scale) => <button className={`${box} ${fontScale === scale ? "bg-slate-900 text-white" : ""}`} key={scale} onClick={() => setFontScale(scale)} type="button">{Math.round(scale * 100)}%</button>)}
            <Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={() => void task(() => exportLines(preview))}>엑셀 내려받기</Button>
            <button className={`${box} bg-slate-900 text-white`} onClick={() => { setPreview(null); setAutoPrint(false); }} type="button">닫기</button>
          </div>
          {error ? <p role="alert" className="pricing-no-print mx-4 text-red-700">{error} 미리보기를 닫고 버전을 다시 선택하거나 내려받기를 다시 시도해 주세요.</p> : null}
          <style>{`@media print{.pricing-preview-modal{position:static!important;overflow:visible!important;background:white!important}.pricing-preview-modal>div{max-width:none!important;padding:0!important}}`}</style>
          <div className="mx-auto max-w-[1400px] p-4">
        <PricingDocumentPreview
          key={`${preview.id}-${preview.publishedAt}-${JSON.stringify(preview.promotionStock)}-${preview.unavailablePromotions.join(",")}`}
          autoPrint={autoPrint}
          fontScale={fontScale}
          version={preview}
          companyId={companyId}
            canManageLinks={manager && storeLinksEnabled && !leadContext}
            publicSharingAvailable={publicSharingAvailable && !leadContext}
          refresh={() => refreshPreview(preview)}
        />
          </div>
        </div>
      )}
    </div>
  );
}
