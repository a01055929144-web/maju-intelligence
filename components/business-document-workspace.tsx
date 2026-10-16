"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, Printer, RotateCcw, Search, WalletCards, X } from "lucide-react";
import { calculateErpLine, calculateErpTotals, type ErpTaxType } from "@/domains/erp/business-document";

type DocType = "sale" | "purchase" | "sale_return" | "purchase_return";
type Doc = { id: string; documentType: DocType; documentNumber: string; documentDate: string; status: "draft" | "confirmed" | "cancelled"; customerId?: string; supplierId?: string; originalDocumentId?: string; partnerName: string; memo?: string; totalAmount: number; taxAmount: number; createdAt: string; lines?: Line[] };
type Line = { id?: string; productCatalogId?: string; supplierProductId?: string; productCode?: string; productName: string; specification?: string; unit: string; taxType: ErpTaxType; quantity: number; unitPrice: number };
type Option = { id: string; name: string };
type Options = { customers: Option[]; suppliers: Option[]; products: Array<{ id: string; product_code?: string; canonical_name?: string; purchase_product_name: string; specification_value?: string; specification_unit?: string; sales_unit?: string; tax_type?: ErpTaxType; default_sales_price?: number }>; supplierProducts: Array<{ id: string; supplier_id: string; raw_name: string; raw_spec?: string; raw_unit?: string; latest_cost?: number; parsed_tax_type?: ErpTaxType }> };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const money = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const labels = { sale: "매출", purchase: "매입", sale_return: "매출 반품", purchase_return: "매입 반품" } as const;
const statusLabels = { draft: "작성중", confirmed: "확정", cancelled: "취소" } as const;
const emptyLine = (): Line => ({ productName: "", unit: "EA", taxType: "taxable", quantity: 1, unitPrice: 0 });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "요청을 처리하지 못했습니다.");
  return body as T;
}

export function BusinessDocumentWorkspace({ companyId = "" }: { companyId?: string }) {
  const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const [tab, setTab] = useState<"documents" | "ledger">("documents");
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [options, setOptions] = useState<Options>({ customers: [], suppliers: [], products: [], supplierProducts: [] });
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", type: "", status: "", partnerId: "" });
  const [editor, setEditor] = useState<Doc | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ ...(companyId ? { companyId } : {}), ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) });
    const result = await api<{ items: Doc[] }>(`/api/business-documents?${query}`);
    setDocuments(result.items);
  }, [companyId, filters]);
  useEffect(() => { void Promise.all([load(), api<Options>(`/api/business-documents${suffix}${suffix ? "&" : "?"}mode=options`).then(setOptions)]).catch((e) => setMessage(e.message)); }, [load, suffix]);

  const openNew = (type: "sale" | "purchase" = "sale") => setEditor({ id: "", documentType: type, documentNumber: "저장 시 자동 채번", documentDate: today(), status: "draft", partnerName: "", totalAmount: 0, taxAmount: 0, createdAt: "", lines: [emptyLine()] });
  const openDocument = async (doc: Doc) => {
    setBusy(true); setMessage("");
    try { const result = await api<{ document: Doc }>(`/api/business-documents/${doc.id}${suffix}`); setEditor(result.document); }
    catch (e) { setMessage(e instanceof Error ? e.message : "전표를 열지 못했습니다."); } finally { setBusy(false); }
  };
  const act = async (doc: Doc, action: "confirm" | "cancel" | "return") => {
    const reason = action === "cancel" ? window.prompt("취소 사유를 입력해 주세요.") : "";
    if (action === "cancel" && !reason) return;
    setBusy(true); setMessage("작업 진행 중입니다…");
    try {
      const result = await api<{ document: Doc }>(`/api/business-documents/${doc.id}/actions${suffix}`, { method: "POST", body: JSON.stringify({ action, reason, companyId }) });
      setEditor(result.document); setMessage(action === "return" ? "반품 전표 초안을 만들었습니다." : "처리했습니다."); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "documents" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} onClick={() => setTab("documents")}>전표</button>
        <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "ledger" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} onClick={() => setTab("ledger")}>거래처원장</button>
      </div>
      {tab === "documents" && <div className="flex gap-2"><button className="maju-button-secondary" onClick={() => openNew("purchase")}><FilePlus2 className="h-4 w-4" /> 매입 전표</button><button className="maju-button-primary" onClick={() => openNew("sale")}><FilePlus2 className="h-4 w-4" /> 매출 전표</button></div>}
    </div>
    {message && <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</div>}
    {tab === "documents" ? <>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-5">
        <input className="maju-input" type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
        <input className="maju-input" type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
        <select className="maju-input" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">유형 전체</option><option value="sale">매출</option><option value="purchase">매입</option><option value="sale_return">매출 반품</option><option value="purchase_return">매입 반품</option></select>
        <select className="maju-input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">상태 전체</option><option value="draft">작성중</option><option value="confirmed">확정</option><option value="cancelled">취소</option></select>
        <button className="maju-button-secondary" onClick={() => void load()}><Search className="h-4 w-4" /> 조회</button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">거래일</th><th>전표번호</th><th>유형</th><th>거래처</th><th>상태</th><th className="text-right">합계</th><th className="px-4 text-right">작업</th></tr></thead><tbody className="divide-y divide-slate-100">{documents.map((doc) => <tr key={doc.id} className="hover:bg-slate-50"><td className="px-4 py-3">{doc.documentDate}</td><td className="font-medium">{doc.documentNumber}</td><td>{labels[doc.documentType]}</td><td>{doc.partnerName}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{statusLabels[doc.status]}</span></td><td className="text-right font-semibold">{money(doc.totalAmount)}</td><td className="px-4 text-right"><button className="text-sm font-semibold text-teal-700" onClick={() => void openDocument(doc)}>열기</button></td></tr>)}</tbody></table></div>
        {!documents.length && <div className="p-12 text-center text-sm text-slate-500">조건에 맞는 전표가 없습니다.</div>}
      </div>
    </> : <LedgerPanel companyId={companyId} options={options} />}
    {editor && <DocumentEditor busy={busy} companyId={companyId} doc={editor} options={options} onAct={act} onClose={() => setEditor(null)} onSaved={async (doc) => { setEditor(doc); setMessage("전표를 저장했습니다."); await load(); }} />}
  </div>;
}

function DocumentEditor({ busy, companyId, doc, options, onAct, onClose, onSaved }: { busy: boolean; companyId: string; doc: Doc; options: Options; onAct: (doc: Doc, action: "confirm" | "cancel" | "return") => Promise<void>; onClose: () => void; onSaved: (doc: Doc) => Promise<void> }) {
  const [form, setForm] = useState({ ...doc, lines: doc.lines?.length ? doc.lines : [emptyLine()] });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [contractPrices, setContractPrices] = useState<Record<string, { taxType: ErpTaxType; unitPrice: number }>>({});
  const isSale = form.documentType.startsWith("sale"); const isDraft = form.status === "draft";
  const totals = useMemo(() => calculateErpTotals(form.lines.map((line) => ({ quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxType: line.taxType }))), [form.lines]);
  const catalog = isSale ? options.products : options.supplierProducts.filter((x) => !form.supplierId || x.supplier_id === form.supplierId);
  useEffect(() => {
    if (!isSale || !form.customerId) { setContractPrices({}); return; }
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    void api<{ agreements: Array<{ productCatalogId: string; status: string; taxType: ErpTaxType; unitPrice: number }> }>(`/api/customers/${form.customerId}/contract-prices${query}`)
      .then(({ agreements }) => setContractPrices(Object.fromEntries(agreements.filter((item) => item.status === "active").map((item) => [item.productCatalogId, { taxType: item.taxType, unitPrice: item.unitPrice }])))
      .catch(() => setContractPrices({}));
  }, [companyId, form.customerId, isSale]);
  const save = async () => {
    setSaving(true); setError("");
    try {
      const url = form.id ? `/api/business-documents/${form.id}${companyId ? `?companyId=${companyId}` : ""}` : "/api/business-documents";
      const result = await api<{ document: Doc }>(url, { method: form.id ? "PATCH" : "POST", body: JSON.stringify({ ...form, companyId }) });
      await onSaved(result.document);
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); } finally { setSaving(false); }
  };
  const patchLine = (index: number, patch: Partial<Line>) => setForm({ ...form, lines: form.lines.map((line, i) => i === index ? { ...line, ...patch } : line) });
  const chooseProduct = (index: number, id: string) => {
    if (isSale) { const product = options.products.find((x) => x.id === id); const contract = contractPrices[id]; if (product) patchLine(index, { productCatalogId: product.id, supplierProductId: undefined, productCode: product.product_code, productName: product.canonical_name || product.purchase_product_name, specification: [product.specification_value, product.specification_unit].filter(Boolean).join(" "), unit: product.sales_unit || "EA", taxType: contract?.taxType || product.tax_type || "taxable", unitPrice: Number(contract?.unitPrice ?? product.default_sales_price ?? 0) }); }
    else { const product = options.supplierProducts.find((x) => x.id === id); if (product) patchLine(index, { supplierProductId: product.id, productCatalogId: undefined, productName: product.raw_name, specification: product.raw_spec, unit: product.raw_unit || "EA", taxType: product.parsed_tax_type || "taxable", unitPrice: Number(product.latest_cost || 0) }); }
  };
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"><div className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl">
    <header className="flex items-center justify-between border-b px-5 py-4"><div><div className="text-xs font-semibold text-teal-700">{labels[form.documentType]}</div><h2 className="text-xl font-bold">{form.documentNumber}</h2></div><button aria-label="닫기" onClick={onClose}><X /></button></header>
    <div className="flex-1 space-y-5 overflow-y-auto p-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 md:grid-cols-3"><label className="text-sm font-semibold">거래일<input disabled={!isDraft} className="maju-input mt-1 w-full" type="date" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} /></label><label className="text-sm font-semibold">{isSale ? "매출처" : "매입처"}<select disabled={!isDraft || Boolean(form.originalDocumentId)} className="maju-input mt-1 w-full" value={isSale ? form.customerId || "" : form.supplierId || ""} onChange={(e) => setForm({ ...form, ...(isSale ? { customerId: e.target.value } : { supplierId: e.target.value }) })}><option value="">선택</option>{(isSale ? options.customers : options.suppliers).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="text-sm font-semibold">메모<input disabled={!isDraft} className="maju-input mt-1 w-full" value={form.memo || ""} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></label></div>
      <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-bold">품목</h3>{isDraft && <button className="maju-button-secondary" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}>+ 품목 추가</button>}</div>{form.lines.map((line, index) => { const amount = calculateErpLine({ quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxType: line.taxType }); return <div key={line.id || index} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[2fr_0.7fr_0.7fr_1fr_0.8fr_auto]"><select disabled={!isDraft} className="maju-input" value={line.productCatalogId || line.supplierProductId || ""} onChange={(e) => chooseProduct(index, e.target.value)}><option value="">품목 선택</option>{catalog.map((x) => <option key={x.id} value={x.id}>{"raw_name" in x ? x.raw_name : x.canonical_name || x.purchase_product_name}</option>)}</select><input disabled={!isDraft} className="maju-input" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => patchLine(index, { quantity: Number(e.target.value) })} /><input disabled={!isDraft} className="maju-input" value={line.unit} onChange={(e) => patchLine(index, { unit: e.target.value })} /><input disabled={!isDraft} className="maju-input" type="number" min="0" value={line.unitPrice} onChange={(e) => patchLine(index, { unitPrice: Number(e.target.value) })} /><select disabled={!isDraft} className="maju-input" value={line.taxType} onChange={(e) => patchLine(index, { taxType: e.target.value as ErpTaxType })}><option value="taxable">과세</option><option value="exempt">면세</option></select><div className="flex items-center gap-2 text-right"><strong className="min-w-24">{money(amount.totalAmount)}</strong>{isDraft && <button className="text-red-500" onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}>삭제</button>}</div></div>; })}</div>
      <div className="ml-auto grid max-w-lg grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 text-sm"><span>과세 공급가</span><b className="text-right">{money(totals.taxableSupplyAmount)}</b><span>면세 공급가</span><b className="text-right">{money(totals.exemptSupplyAmount)}</b><span>부가세</span><b className="text-right">{money(totals.taxAmount)}</b><span className="text-base font-bold">합계</span><b className="text-right text-lg text-teal-800">{money(totals.totalAmount)}</b></div>
    </div>
    <footer className="flex flex-wrap justify-end gap-2 border-t p-4">{form.status === "confirmed" && <><a className="maju-button-secondary" href={`/operations/documents/${form.id}/print${companyId ? `?companyId=${companyId}` : ""}`} target="_blank"><Printer className="h-4 w-4" /> 거래명세서</a>{["sale", "purchase"].includes(form.documentType) && <button className="maju-button-secondary" disabled={busy} onClick={() => void onAct(form, "return")}><RotateCcw className="h-4 w-4" /> 반품 작성</button>}<button className="maju-button-secondary text-red-600" disabled={busy} onClick={() => void onAct(form, "cancel")}>취소</button></>}{isDraft && <><button className="maju-button-secondary" disabled={saving} onClick={() => void save()}>{saving ? "저장 중…" : "작성중 저장"}</button>{form.id && <button className="maju-button-primary" disabled={busy} onClick={() => void onAct(form, "confirm")}>확정</button>}</>}</footer>
  </div></div>;
}

function LedgerPanel({ companyId, options }: { companyId: string; options: Options }) {
  const [type, setType] = useState<"customer" | "supplier">("customer"); const [partnerId, setPartnerId] = useState("");
  const [dateFrom, setDateFrom] = useState(`${today().slice(0, 7)}-01`); const [dateTo, setDateTo] = useState(today());
  const [ledger, setLedger] = useState<{ openingBalance: number; closingBalance: number; entries: Array<{ id: string; entry_date: string; entry_type: string; amount: number; runningBalance: number; memo?: string }> } | null>(null);
  const [message, setMessage] = useState(""); const partners = type === "customer" ? options.customers : options.suppliers;
  const load = async () => { if (!partnerId) return setMessage("거래처를 선택해 주세요."); const q = new URLSearchParams({ ...(companyId ? { companyId } : {}), partnerType: type, partnerId, dateFrom, dateTo }); try { setLedger(await api(`/api/partner-ledger?${q}`)); setMessage(""); } catch (e) { setMessage(e instanceof Error ? e.message : "원장을 불러오지 못했습니다."); } };
  const payment = async () => { const raw = window.prompt(type === "customer" ? "입금액을 입력하세요." : "지급액을 입력하세요."); if (!raw) return; try { await api("/api/partner-ledger", { method: "POST", body: JSON.stringify({ companyId, partnerType: type, partnerId, entryDate: today(), amount: Number(raw.replace(/,/g, "")), paymentMethod: "bank", idempotencyKey: crypto.randomUUID() }) }); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "등록하지 못했습니다."); } };
  return <div className="space-y-3"><div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-6"><select className="maju-input" value={type} onChange={(e) => { setType(e.target.value as typeof type); setPartnerId(""); setLedger(null); }}><option value="customer">매출처</option><option value="supplier">매입처</option></select><select className="maju-input md:col-span-2" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">거래처 선택</option>{partners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><input className="maju-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /><input className="maju-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /><button className="maju-button-primary" onClick={() => void load()}><WalletCards className="h-4 w-4" /> 원장 조회</button></div>{message && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</div>}{ledger && <div className="overflow-hidden rounded-2xl border bg-white"><div className="grid grid-cols-3 gap-3 border-b bg-slate-50 p-4 text-sm"><span>기초잔액 <b>{money(ledger.openingBalance)}</b></span><span>기말잔액 <b>{money(ledger.closingBalance)}</b></span><button className="ml-auto font-semibold text-teal-700" onClick={() => void payment()}>{type === "customer" ? "입금 등록" : "지급 등록"}</button></div><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-3">일자</th><th>구분</th><th>메모</th><th className="text-right">금액</th><th className="px-4 text-right">잔액</th></tr></thead><tbody className="divide-y">{ledger.entries.map((x) => <tr key={x.id}><td className="px-4 py-3">{x.entry_date}</td><td>{x.entry_type}</td><td>{x.memo || "-"}</td><td className="text-right">{money(x.amount)}</td><td className="px-4 text-right font-semibold">{money(x.runningBalance)}</td></tr>)}</tbody></table></div>}</div>;
}
