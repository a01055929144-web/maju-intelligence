"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { koreaDay, type CatalogChoice, type DocumentDraft, type DocumentKind } from "@/domains/pricing/document";
import { documentRequest } from "@/lib/pricing/document-client";

type SheetRow = DocumentDraft & { published: boolean; stale: boolean; status: string };
type Props = {
  companyId: string;
  manager: boolean;
  onCreate: (kind: DocumentKind) => void;
  onOpen: (document: DocumentDraft) => Promise<void>;
  onCopy: (document: DocumentDraft) => void;
};
const day = (value: string) => value.slice(0, 10);
const addDays = (value: string, days: number) => koreaDay(new Date(new Date(`${value}T12:00:00+09:00`).getTime() + days * 86400000));

export function PricingDocumentSheets({ companyId, manager, onCreate, onOpen, onCopy }: Props) {
  const today = koreaDay();
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [scope, setScope] = useState("전체");
  const [dateBasis, setDateBasis] = useState("작성일");
  const [dateRange, setDateRange] = useState("전체");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    const all: DocumentDraft[] = [];
    let total = 0;
    for (let page = 1; page <= 20; page++) {
      const response = await documentRequest<{ items: DocumentDraft[]; total: number }>(companyId, "list", { page });
      all.push(...response.result.items);
      total = response.result.total;
      if (all.length >= total) break;
    }
    // ponytail: P1 lists 50 rows per call; add a bulk summary endpoint if companies exceed 1,000 documents.
    if (all.length < total) setMessage(`최근 ${all.length}개 문서만 표시합니다. 전체 ${total}개 중 이전 문서는 다음 조회 범위 확장이 필요합니다.`);
    if (all.some(document => !document.recalculation)) throw new Error("문서 가격 상태를 확인하지 못했습니다. 다시 불러와 주세요.");
    setDocuments(all);
  }, [companyId]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다.")).finally(() => setLoading(false)); }, [load]);

  const rows = useMemo<SheetRow[]>(() => documents.map((document) => {
    const stale = document.recalculation!.needsRecalculation;
    const published = Boolean(document.recalculation!.publishedAt);
    const state = stale ? "다시 계산 필요" : day(document.content.validUntil) < today ? "만료" : published ? "게시 중" : "작성중";
    return { ...document, published, stale, status: state };
  }), [documents, today]);
  const visible = rows.filter((row) => {
    if (kind === "단가표" && row.content.kind !== "sheet") return false;
    if (kind === "견적서" && row.content.kind !== "quote") return false;
    if ((kind === "행사" || kind === "임박") && !row.content.lines.some((line) => line.badge === kind)) return false;
    if (status !== "전체" && row.status !== status) return false;
    if (scope === "회사 공용" && row.content.kind !== "sheet") return false;
    if (scope === "작성자 전용" && row.content.kind !== "quote") return false;
    if (search && !`${row.content.title} ${row.content.recipient}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))) return false;
    const date = dateBasis === "유효기간" ? row.content.validUntil : day(row.updatedAt);
    const start = dateRange === "이번 달" ? `${today.slice(0, 7)}-01` : from;
    if (dateRange === "오늘" && date !== today) return false;
    if (dateRange === "7일" || dateRange === "30일") {
      const span = dateRange === "7일" ? 7 : 30;
      if (dateBasis === "유효기간" ? date < today || date > addDays(today, span) : date < addDays(today, -span) || date > today) return false;
    }
    if (((dateRange === "이번 달" || dateRange === "기간 지정") && start && date < start) || (dateRange === "기간 지정" && to && date > to)) return false;
    return true;
  });
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function priceCommand(action: "recalculate" | "restore") {
    const params = new URLSearchParams({ companyId });
    let batchId: string | undefined;
    if (action === "restore") {
      const response = await fetch(`/api/price-sheets?${params}`, { cache: "no-store" });
      const state = await response.json();
      if (!response.ok || !state.lastBatch) throw new Error("복구할 직전 계산이 없습니다.");
      batchId = state.lastBatch;
    }
    const response = await fetch(`/api/price-sheets?${params}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, batchId }) });
    if (!response.ok) throw new Error("가격 계산을 완료하지 못했습니다. 다시 확인해 주세요.");
    setMessage(action === "restore" ? "직전 판매가 계산을 복구했습니다." : "변동분 판매가 계산을 마쳤습니다.");
  }
  async function recalculateDocuments() {
    if (!selectedRows.length) return;
    let done = 0;
    for (const document of selectedRows) {
      try {
        const ids = Array.from(new Set(document.content.lines.filter((line) => !line.promotionId).map((line) => line.productId)));
        const response = await documentRequest<{ items: CatalogChoice[] }>(companyId, "catalog", { productIds: ids });
        const prices = new Map(response.result.items.map((item) => [item.id, item.price]));
        const content = { ...document.content, lines: document.content.lines.map((line) => ({ ...line, price: !line.promotionId && prices.has(line.productId) ? prices.get(line.productId)! : line.price })) };
        await documentRequest(companyId, "save", { id: document.id, expected: document.revision, content }, true);
        done++;
      } catch (cause) {
        throw new Error(`${done}개 문서 갱신됨 · ${selectedRows.length - done}개 미갱신. ${cause instanceof Error ? cause.message : "다시 시도해 주세요."}`);
      }
    }
    setMessage(`${done}개 문서 초안을 현재 판매가로 갱신했습니다. 공개하려면 각 문서에서 버전을 확정해 주세요.`);
  }
  async function extend() {
    let done = 0;
    for (const document of selectedRows) {
      try {
        const base = document.content.validUntil > today ? document.content.validUntil : today;
        await documentRequest(companyId, "save", { id: document.id, expected: document.revision, content: { ...document.content, validUntil: addDays(base, 7) } }, true);
        done++;
      } catch (cause) {
        throw new Error(`${done}개 기간 연장됨 · ${selectedRows.length - done}개 미연장. ${cause instanceof Error ? cause.message : "다시 시도해 주세요."}`);
      }
    }
    setMessage(`${done}개 문서의 초안 유효기간을 7일 늘렸습니다. 공개하려면 버전을 확정해 주세요.`);
  }
  async function exportSelected() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(selectedRows.map((row) => ({ 종류: row.content.kind === "sheet" ? "단가표" : "견적서", 이름: row.content.title, 상태: row.status, 품목수: row.content.lines.length, 유효기간: row.content.validUntil })));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "문서");
    const url = URL.createObjectURL(new Blob([XLSX.write(book, { type: "array", bookType: "xlsx" })]));
    const link = document.createElement("a"); link.href = url; link.download = "견적서_단가표.xlsx"; link.click(); URL.revokeObjectURL(url);
  }

  const columns = useMemo<CommonTableColumn<SheetRow>[]>(() => [
    { key: "select", label: "선택", value: (row) => selected.includes(row.id) ? 1 : 0, render: (row) => <input aria-label={`${row.content.title} 선택`} type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected((ids) => ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id])} /> },
    { key: "kind", label: "종류", value: (row) => row.content.kind === "sheet" ? "단가표" : "견적서" },
    { key: "title", label: "이름", value: (row) => row.content.title, render: (row) => <button className="text-teal-700 underline" onClick={() => void onOpen(row).catch((cause) => setError(cause instanceof Error ? cause.message : "문서를 열지 못했습니다."))} type="button">{row.content.title}</button> },
    { key: "scope", label: "공개 범위", value: (row) => row.content.kind === "sheet" ? "회사 공용" : "작성자 전용" },
    { key: "lines", label: "품목 수", value: (row) => row.content.lines.length, total: true },
    { key: "margin", label: "평균 마진", value: () => "–" },
    { key: "discount", label: "평균 할인율", value: () => "–" },
    { key: "monthlyCost", label: "이번 달 주문 매입가", value: () => "–" },
    { key: "monthlySales", label: "이번 달 주문 판매가", value: () => "–" },
    { key: "status", label: "상태", value: (row) => row.status, render: (row) => <span>{row.status}{row.stale ? ` · ${row.recalculation?.changedProductCount}개 품목` : ""}</span> },
    { key: "created", label: "작성일", value: (row) => day(row.updatedAt) },
    { key: "expires", label: "유효기간", value: (row) => row.content.validUntil },
    { key: "links", label: "매장 링크(곳·주문·열람)", value: () => "–" },
  ], [onOpen, selected]);
  return <div className="space-y-4" aria-busy={busy}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">견적서·단가표</h1><p className="text-sm text-slate-600">작성한 문서를 고르고 편집하거나 새로 만드세요.</p></div><div className="flex flex-wrap gap-2"><Link className="maju-button-secondary" href="/dashboard/settings/company?tab=order">주문 설정</Link><button className="maju-button-secondary" disabled={!manager || busy} onClick={() => void run(() => priceCommand("restore"))} type="button">직전 변동분 복구</button><button className="maju-button-secondary" disabled={!manager || busy} onClick={() => void run(() => priceCommand("recalculate"))} type="button">변동분 일괄 계산</button><button className="maju-button-primary" onClick={() => onCreate("quote")} type="button">+ 견적서</button>{manager ? <button className="maju-button-primary" onClick={() => onCreate("sheet")} type="button">+ 단가표</button> : null}</div></header>
    {error ? <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error} <button className="underline" onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다."))} type="button">다시 시도</button></p> : null}
    {message ? <p role="status" className="rounded bg-teal-50 p-3">{message}</p> : null}
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[["게시 중", rows.filter((row) => row.status === "게시 중").length], ["다시 계산 필요", `${rows.filter((row) => row.stale).length}건 · ${rows.filter((row) => row.stale).reduce((n, row) => n + (row.recalculation?.changedProductCount || 0), 0)}개 품목`], ["이번 주 링크 주문", "–"], ["만료 7일 이내", rows.filter((row) => row.content.validUntil >= today && row.content.validUntil <= addDays(today, 7)).length]].map(([label, value]) => <div className="maju-section-card p-3" key={label}><p className="text-sm text-slate-600">{label}</p><strong>{value}</strong></div>)}</div>
    <div className="flex flex-wrap gap-2">{["전체", "단가표", "견적서", "행사", "임박"].map((item) => <button aria-pressed={kind === item} className={kind === item ? "maju-button-primary" : "maju-button-secondary"} key={item} onClick={() => setKind(item)} type="button">{item}</button>)}<select aria-label="문서 상태" className="maju-input" value={status} onChange={(event) => setStatus(event.target.value)}>{["전체", "작성중", "게시 중", "다시 계산 필요", "만료"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="공개 범위" className="maju-input" value={scope} onChange={(event) => setScope(event.target.value)}>{["전체", "회사 공용", "작성자 전용"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="날짜 기준" className="maju-input" value={dateBasis} onChange={(event) => setDateBasis(event.target.value)}><option>작성일</option><option>유효기간</option></select><select aria-label="날짜 범위" className="maju-input" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>{["전체", "오늘", "7일", "30일", "이번 달", "기간 지정"].map((item) => <option key={item}>{item}</option>)}</select>{dateRange === "기간 지정" ? <><input aria-label="시작일" className="maju-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><input aria-label="종료일" className="maju-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></> : null}<input aria-label="이름·매장 검색" className="maju-input" placeholder="이름·매장 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <div className="flex flex-wrap items-center gap-2"><span>선택 {selected.length}건</span><button className="maju-button-secondary" disabled={!selected.length || busy} onClick={() => void run(exportSelected)} type="button">엑셀 내보내기</button><button className="maju-button-secondary" disabled={!selected.length || busy} onClick={() => void run(recalculateDocuments)} type="button">다시 계산</button><button className="maju-button-secondary" disabled={!selected.length || busy} onClick={() => void run(extend)} type="button">기간 연장</button><button className="maju-button-secondary" disabled={selected.length !== 1} onClick={() => onCopy(selectedRows[0])} type="button">복사</button></div>
    {loading ? <p role="status" className="maju-section-card p-6">문서를 불러오는 중입니다.</p> : documents.length ? <CommonDataTable columns={columns} rows={visible} rowKey={(row) => row.id} settingsKey={`pricing-documents:${companyId}`} emptyMessage="조건에 맞는 문서가 없습니다. 필터를 바꾸거나 새 문서를 작성해 주세요." /> : <div className="maju-section-card p-6">아직 문서가 없습니다. <button className="text-teal-700 underline" onClick={() => onCreate(manager ? "sheet" : "quote")} type="button">{manager ? "+ 단가표" : "+ 견적서"}</button>부터 작성해 보세요.</div>}
    <p className="text-sm text-slate-600">작성일은 현재 마지막 수정일을 기준으로 표시합니다. 평균 마진·할인율·주문 집계는 이 문서 원장에 값이 없어 –로 표시합니다.</p>
  </div>;
}
