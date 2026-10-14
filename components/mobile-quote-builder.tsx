"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Copy, FileText, Loader2, Plus, Search, Share2, Trash2, X } from "lucide-react";
import {
  applyDefaultMargin,
  calculateQuoteTotals,
  calculateSalesPrice,
  resolveQuoteValidUntil,
  type QuoteLine
} from "@/domains/quote/quote";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";
import type { SalesQuoteEditorData } from "@/lib/store";
import type { SalesQuoteFieldErrors } from "@/domains/quote/quote";

type CatalogItem = {
  id: string;
  matchStatus: QuoteLine["matchStatus"] | "inactive";
  name: string;
  purchasePrice: number;
  salesName?: string;
  salesPrice?: number;
  salesSpec?: string;
  salesUnit?: string;
  spec?: string;
  unit: string;
};

type IssuedQuote = { publicUrl: string; quoteNumber: string };

export function MobileQuoteBuilder({
  customerId,
  initialQuote,
  leadId,
  recipientName,
  recipientPhone,
  contactMemo,
  onIssued
}: {
  customerId?: string;
  initialQuote?: SalesQuoteEditorData;
  leadId?: string;
  recipientName: string;
  recipientPhone?: string;
  contactMemo: string;
  onIssued: (quote: IssuedQuote) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const initialLines = initialQuote?.items.map((item, index) => ({
    catalogProductId: item.productCatalogId, id: `saved-${index}`, item: item.productName,
    marginRate: item.marginPercent, matchStatus: item.isCustomRequest ? "requested" as const : "matched" as const,
    photoUrl: item.photoUrl, purchasePrice: item.purchaseUnitPrice, qty: item.quantity, spec: item.specification || "", unit: item.unit || "EA",
    unitPrice: item.salesUnitPrice
  })) || [];
  const initialValidDays = initialQuote ? Math.max(1, Math.ceil((new Date(initialQuote.validUntil).getTime() - Date.now()) / 86_400_000)) : 14;
  const [lines, setLines] = useState<QuoteLine[]>(initialLines);
  const [margin, setMargin] = useState(initialQuote?.defaultMarginPercent || 12);
  const [validDays, setValidDays] = useState(initialValidDays);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [issued, setIssued] = useState<IssuedQuote | null>(initialQuote?.status === "sent" ? { publicUrl: `/quote/${initialQuote.publicToken}`, quoteNumber: initialQuote.quoteNumber } : null);
  const [quoteId, setQuoteId] = useState(initialQuote?.id || "");
  const [fieldErrors, setFieldErrors] = useState<SalesQuoteFieldErrors>({});
  const [copied, setCopied] = useState(false);
  const [photos, setPhotos] = useState<Record<string, File>>({});
  const [photoStates, setPhotoStates] = useState<Record<string, "idle" | "uploading" | "uploaded" | "error">>({});
  const [uploadedPhotoPaths, setUploadedPhotoPaths] = useState<Record<string, string>>({});
  const [savedPreferences, setSavedPreferences] = useState({ margin: initialQuote?.defaultMarginPercent || 12, validDays: initialValidDays });
  const [savedDraftSignature, setSavedDraftSignature] = useState(initialQuote ? JSON.stringify({ lines: initialLines, margin: initialQuote.defaultMarginPercent, photos: [], validDays: initialValidDays }) : "");
  const localDraftKey = `maju:quote-composer:v1:${initialQuote?.id || leadId || customerId || "unlinked"}`;
  const restoredLocalDraftRef = useRef(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/product-catalog", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { items?: CatalogItem[]; message?: string } | null;
        if (!response.ok) throw new Error(payload?.message || "상품 원장을 불러오지 못했습니다.");
        if (active) {
          setCatalog((payload?.items || []).filter((item) => item.matchStatus !== "inactive"));
          setCatalogState("ready");
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "상품 원장을 불러오지 못했습니다.");
          setCatalogState("error");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (initialQuote) return;
    try {
      const raw = window.localStorage.getItem(localDraftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { lines?: QuoteLine[]; margin?: number; validDays?: number };
      if (!draft.lines?.length || !window.confirm("작성 중인 견적이 있습니다. 불러올까요?")) return;
      restoredLocalDraftRef.current = true;
      setLines(draft.lines);
      if (Number.isFinite(draft.margin)) setMargin(Number(draft.margin));
      if (Number.isFinite(draft.validDays)) setValidDays(Number(draft.validDays));
      setMessage("브라우저에 보관된 작성 중 견적을 불러왔습니다.");
      setMessageTone("success");
    } catch {
      // 저장소 접근 제한이나 손상된 임시 데이터는 작성 흐름을 막지 않습니다.
    }
  }, [initialQuote, localDraftKey]);

  useEffect(() => {
    if (initialQuote) return;
    let active = true;
    void fetch("/api/customer/settings", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { company?: { defaultQuoteMarginPercent?: number; defaultQuoteValidDays?: number }; message?: string } | null;
        if (!response.ok) throw new Error(payload?.message || "견적 기본 설정을 불러오지 못했습니다.");
        if (!active || restoredLocalDraftRef.current) return;
        const nextMargin = Number(payload?.company?.defaultQuoteMarginPercent);
        const nextValidDays = Number(payload?.company?.defaultQuoteValidDays);
        const resolvedMargin = [10, 12, 15].includes(nextMargin) ? nextMargin : 12;
        const resolvedValidDays = [7, 14, 30].includes(nextValidDays) ? nextValidDays : 14;
        setMargin(resolvedMargin);
        setValidDays(resolvedValidDays);
        setSavedPreferences({ margin: resolvedMargin, validDays: resolvedValidDays });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "견적 기본 설정을 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [initialQuote]);

  const totals = useMemo(() => calculateQuoteTotals(lines), [lines]);
  const draftSignature = useMemo(() => JSON.stringify({
    lines,
    margin,
    photos: Object.entries(photos).map(([id, file]) => [id, file.name, file.size, file.lastModified]),
    validDays
  }), [lines, margin, photos, validDays]);
  const hasDraftInput = lines.length > 0 || Object.keys(photos).length > 0 || margin !== savedPreferences.margin || validDays !== savedPreferences.validDays;
  useUnsavedChangesWarning(savedDraftSignature ? draftSignature !== savedDraftSignature : hasDraftInput);
  useEffect(() => {
    if (!hasDraftInput) return;
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(localDraftKey, JSON.stringify({ lines, margin, validDays, savedAt: new Date().toISOString() })); } catch { /* 브라우저 저장 실패는 서버 저장을 막지 않습니다. */ }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [hasDraftInput, lines, localDraftKey, margin, validDays]);
  const candidates = useMemo(() => {
    const token = query.trim().toLocaleLowerCase("ko-KR");
    return catalog.filter((item) => !token || [item.name, item.salesName, item.spec, item.salesSpec].some((value) => value?.toLocaleLowerCase("ko-KR").includes(token))).slice(0, 20);
  }, [catalog, query]);

  function addCatalogItem(item: CatalogItem) {
    const purchasePrice = item.purchasePrice || 0;
    setLines((current) => [...current, {
      catalogProductId: item.id,
      id: crypto.randomUUID(),
      item: item.salesName || item.name,
      marginRate: margin,
      matchStatus: item.matchStatus === "inactive" ? "unmatched" : item.matchStatus,
      purchasePrice,
      qty: 1,
      spec: item.salesSpec || item.spec || "",
      unit: item.salesUnit || item.unit || "EA",
      unitPrice: item.salesPrice || calculateSalesPrice(purchasePrice, margin)
    }]);
  }

  function addCustomItem() {
    setLines((current) => [...current, {
      id: crypto.randomUUID(), item: "", marginRate: margin, matchStatus: "requested", purchasePrice: 0,
      qty: 1, spec: "", unit: "EA", unitPrice: 0
    }]);
  }

  function updateLine(id: string, patch: Partial<QuoteLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  function changeMargin(nextMargin: number) {
    const recalculable = lines.some((line) => !line.priceLocked && line.purchasePrice > 0);
    setMargin(nextMargin);
    if (recalculable && window.confirm("잠금하지 않은 품목의 판매가를 새 마진율로 다시 계산할까요?")) {
      setLines((current) => applyDefaultMargin(current, nextMargin));
    }
  }

  async function uploadPendingPhotos() {
    const nextPaths = { ...uploadedPhotoPaths };
    for (const line of lines) {
      const photo = photos[line.id];
      if (!photo || nextPaths[line.id]) continue;
      setPhotoStates((current) => ({ ...current, [line.id]: "uploading" }));
      const form = new FormData();
      if (!leadId) throw new Error("사진 첨부는 리드 견적에서만 지원됩니다.");
      form.set("leadId", leadId);
      form.set("photo", photo);
      try {
        const response = await fetch("/api/sales-quotes/photos", { method: "POST", body: form });
        const payload = (await response.json().catch(() => null)) as { message?: string; storagePath?: string } | null;
        if (!response.ok || !payload?.storagePath) throw new Error(payload?.message || "사진 업로드에 실패했습니다.");
        nextPaths[line.id] = payload.storagePath;
        setUploadedPhotoPaths((current) => ({ ...current, [line.id]: payload.storagePath! }));
        setPhotoStates((current) => ({ ...current, [line.id]: "uploaded" }));
      } catch (error) {
        setPhotoStates((current) => ({ ...current, [line.id]: "error" }));
        throw new Error(`${line.item || "견적 품목"} 사진 저장 실패: ${error instanceof Error ? error.message : "다시 시도해 주세요."}`);
      }
    }
    return nextPaths;
  }

  async function saveQuote(status: "draft" | "sent") {
    const nextErrors: SalesQuoteFieldErrors = {};
    if (!leadId && !customerId) nextErrors.subject = "리드 또는 거래처 연결이 필요합니다.";
    if (!lines.length || lines.some((line) => !line.item.trim() || line.qty <= 0 || line.unitPrice < 0)) nextErrors.items = "상품명, 수량, 판매단가를 확인해 주세요.";
    if (!Number.isFinite(margin) || margin < 0 || margin > 90) nextErrors.margin = "마진율은 0~90% 사이여야 합니다.";
    if (status === "sent" && !contactMemo.trim() && !initialQuote) nextErrors.subject = "견적 발행 전 컨택 메모를 입력해 주세요.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setMessageTone("error"); setMessage(Object.values(nextErrors)[0] || "입력값을 확인해 주세요."); return; }
    setSaving(true);
    setMessage("");
    try {
      const photoPaths = await uploadPendingPhotos();
      const response = await fetch(quoteId ? `/api/sales-quotes/${encodeURIComponent(quoteId)}` : "/api/sales-quotes", {
        method: quoteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultMarginPercent: margin,
          items: lines.map((line) => ({
            isCustomRequest: line.matchStatus === "requested",
            marginPercent: line.marginRate,
            photoUrl: photoPaths[line.id] || line.photoUrl,
            productCatalogId: line.catalogProductId,
            productName: line.item.trim(),
            purchaseUnitPrice: line.purchasePrice,
            quantity: line.qty,
            salesUnitPrice: line.unitPrice,
            specification: line.spec.trim(),
            unit: line.unit.trim()
          })),
          customerId,
          leadId,
          memo: contactMemo.trim(),
          recipientName,
          recipientPhone,
          status,
          title: `${recipientName} 식자재 견적서`,
          validUntil: resolveQuoteValidUntil(validDays)
        })
      });
      const payload = (await response.json().catch(() => null)) as { fieldErrors?: SalesQuoteFieldErrors; id?: string; message?: string; publicUrl?: string; quoteNumber?: string } | null;
      if (!response.ok || !payload?.quoteNumber) {
        if (payload?.fieldErrors) setFieldErrors(payload.fieldErrors);
        throw new Error(payload?.message || "견적서를 저장하지 못했습니다.");
      }
      setQuoteId(payload.id || quoteId);
      const next = { publicUrl: payload.publicUrl || "", quoteNumber: payload.quoteNumber };
      setIssued(status === "sent" ? next : null);
      setSavedDraftSignature(draftSignature);
      setFieldErrors({});
      try { window.localStorage.removeItem(localDraftKey); } catch { /* 저장 완료 후 정리 실패는 무시 */ }
      setMessage(status === "draft" ? "견적을 임시저장했습니다. 고객에게는 공개되지 않습니다." : "견적서가 저장되었습니다. 고객용 링크에는 원가와 마진이 표시되지 않습니다.");
      setMessageTone("success");
      if (status === "sent" && payload.publicUrl) onIssued(next);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "견적서를 발행하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function copyOrShare(share: boolean) {
    if (!issued) return;
    if (share && navigator.share) {
      await navigator.share({ title: `${recipientName} 견적서`, text: `${recipientName} 담당자님, 견적서를 보내드립니다.`, url: issued.publicUrl }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(issued.publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 p-3" aria-label="모바일 견적 작성">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold">견적 품목 작성</p><p className="mt-0.5 text-[11px] font-semibold text-slate-500">원장 품목을 고르거나 요청 품목을 직접 추가하세요.</p></div>
        <FileText className="h-5 w-5 text-teal-700" />
      </div>
      <div className="mt-3 flex gap-2">
        <label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="mobile-input min-h-10 w-full rounded-lg border py-2 pl-9 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="상품 원장 검색" value={query} /></label>
        <button className="mobile-secondary-action inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs font-semibold" onClick={addCustomItem} type="button"><Plus className="h-4 w-4" />직접</button>
      </div>
      {catalogState === "loading" ? <p className="mt-2 text-xs font-semibold text-slate-500">상품 원장을 불러오는 중입니다.</p> : null}
      {catalogState === "ready" && query ? <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">{candidates.map((item) => <button className="flex min-h-11 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-xs" key={item.id} onClick={() => addCatalogItem(item)} type="button"><span><b>{item.salesName || item.name}</b><span className="ml-1 text-slate-500">{item.salesSpec || item.spec || item.unit}</span></span><span className="font-semibold text-teal-700">추가</span></button>)}{!candidates.length ? <p className="rounded-lg bg-white p-3 text-xs text-slate-500">일치 품목이 없습니다. 직접 추가를 사용하세요.</p> : null}</div> : null}

      <div className="mt-3 space-y-3">{lines.map((line, index) => <QuoteLineEditor key={line.id} index={index} line={line} photoState={photoStates[line.id] || "idle"} onPhotoChange={(file) => { setPhotos((current) => { const next = { ...current }; if (file) next[line.id] = file; else delete next[line.id]; return next; }); setUploadedPhotoPaths((current) => { const next = { ...current }; delete next[line.id]; return next; }); setPhotoStates((current) => ({ ...current, [line.id]: "idle" })); updateLine(line.id, { requestPhotoName: file?.name }); }} onChange={(patch) => updateLine(line.id, patch)} onRemove={() => setLines((current) => current.filter((item) => item.id !== line.id))} />)}</div>
      {!lines.length ? <p className="mt-3 rounded-lg border border-dashed border-teal-200 bg-white p-4 text-center text-xs font-semibold text-slate-500">견적 품목을 추가해 주세요.</p> : null}

      {fieldErrors.subject ? <p className="mt-3 text-xs font-semibold text-rose-700">{fieldErrors.subject}</p> : null}
      {fieldErrors.items ? <p className="mt-2 text-xs font-semibold text-rose-700">{fieldErrors.items}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold">기본 마진율<select aria-invalid={Boolean(fieldErrors.margin)} className="mobile-input mt-1 min-h-10 w-full rounded-lg border px-2 text-sm" value={margin} onChange={(event) => changeMargin(Number(event.target.value))}>{[10,12,15].map((value) => <option key={value} value={value}>{value}%</option>)}</select>{fieldErrors.margin ? <span className="mt-1 block text-rose-700">{fieldErrors.margin}</span> : null}</label>
        <label className="text-[11px] font-semibold">유효기간<select aria-invalid={Boolean(fieldErrors.validUntil)} className="mobile-input mt-1 min-h-10 w-full rounded-lg border px-2 text-sm" value={validDays} onChange={(event) => setValidDays(Number(event.target.value))}>{Array.from(new Set([7,14,30,initialValidDays])).sort((a,b) => a-b).map((value) => <option key={value} value={value}>{value}일</option>)}</select>{fieldErrors.validUntil ? <span className="mt-1 block text-rose-700">{fieldErrors.validUntil}</span> : null}</label>
      </div>
      <div className="mt-3 rounded-lg bg-slate-900 p-3 text-white"><div className="flex justify-between text-xs"><span>판매 합계</span><b>{totals.salesAmount.toLocaleString()}원</b></div><div className="mt-1 flex justify-between text-[11px] text-slate-300"><span>내부 예상 이익 · 고객 비공개</span><span>{totals.expectedProfit.toLocaleString()}원 · {totals.marginRate.toFixed(1)}%</span></div></div>
      {message ? <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${messageTone === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{message}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2"><button className="mobile-secondary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold disabled:opacity-60" disabled={saving} onClick={() => void saveQuote("draft")} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}임시저장</button><button className="mobile-primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:opacity-60" disabled={saving} onClick={() => void saveQuote("sent")} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{issued ? "수정 저장" : "고객용 발행"}</button></div>
      {issued ? <div className="mt-2 grid grid-cols-2 gap-2"><button className="mobile-primary-action inline-flex min-h-11 items-center justify-center gap-1 rounded-lg text-xs font-semibold" onClick={() => void copyOrShare(true)} type="button"><Share2 className="h-4 w-4" />공유</button><button className="mobile-secondary-action inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border text-xs font-semibold" onClick={() => void copyOrShare(false)} type="button">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "복사됨" : "링크 복사"}</button></div> : null}
    </section>
  );
}

function QuoteLineEditor({ index, line, onChange, onPhotoChange, onRemove, photoState }: { index: number; line: QuoteLine; onChange: (patch: Partial<QuoteLine>) => void; onPhotoChange: (file?: File) => void; onRemove: () => void; photoState: "idle" | "uploading" | "uploaded" | "error" }) {
  const [photoUrl, setPhotoUrl] = useState("");
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  return <div className="rounded-lg border bg-white p-3">
    <div className="flex items-center justify-between"><span className="text-xs font-semibold">품목 {index + 1} · {line.matchStatus === "matched" ? "원장 매칭" : line.matchStatus === "requested" ? "요청 품목" : "매칭 확인"}</span><button aria-label={`${index + 1}번 품목 삭제`} className="grid min-h-9 min-w-9 place-items-center rounded-lg text-rose-600" onClick={onRemove} type="button"><Trash2 className="h-4 w-4" /></button></div>
    <input aria-label={`${index + 1}번 상품명`} className="mobile-input mt-2 min-h-10 w-full rounded-lg border px-3 text-sm font-semibold" onChange={(event) => onChange({ item: event.target.value })} placeholder="상품명" value={line.item} />
    <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label={`${index + 1}번 규격`} className="mobile-input min-h-10 rounded-lg border px-3 text-sm" onChange={(event) => onChange({ spec: event.target.value })} placeholder="규격" value={line.spec} /><input aria-label={`${index + 1}번 단위`} className="mobile-input min-h-10 rounded-lg border px-3 text-sm" onChange={(event) => onChange({ unit: event.target.value })} placeholder="단위" value={line.unit} /></div>
    <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] font-semibold text-slate-500">수량<input className="mobile-input mt-1 min-h-10 w-full rounded-lg border px-3 text-sm" min="0.01" onChange={(event) => onChange({ qty: Number(event.target.value) })} step="0.01" type="number" value={line.qty} /></label><label className="text-[10px] font-semibold text-slate-500">판매단가<input className="mobile-input mt-1 min-h-10 w-full rounded-lg border px-3 text-sm" min="0" onChange={(event) => onChange({ unitPrice: Number(event.target.value), priceLocked: true })} step="10" type="number" value={line.unitPrice} /></label></div>
    <label className="mt-2 flex min-h-9 items-center gap-2 text-[11px] font-semibold text-slate-600"><input checked={Boolean(line.priceLocked)} onChange={(event) => onChange({ priceLocked: event.target.checked })} type="checkbox" />판매가 잠금 (기본 마진 변경 시 유지)</label>
    <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed text-xs font-semibold text-slate-600"><Camera className="h-4 w-4" />{line.requestPhotoName || "현장 참고 사진"}<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) { window.alert("사진은 8MB 이하만 선택할 수 있습니다."); return; } if (photoUrl) URL.revokeObjectURL(photoUrl); setPhotoUrl(URL.createObjectURL(file)); onPhotoChange(file); event.currentTarget.value = ""; }} /></label>
    {photoState !== "idle" ? <p className={`mt-1 text-[11px] font-semibold ${photoState === "error" ? "text-rose-700" : "text-teal-700"}`}>{photoState === "uploading" ? "사진 저장 중…" : photoState === "uploaded" ? "사진 저장 완료" : "사진 저장 실패 · 발행 버튼으로 재시도"}</p> : null}
    {photoUrl ? <div className="relative mt-2 overflow-hidden rounded-lg"><img alt={`${line.item || "견적 품목"} 참고`} className="h-28 w-full object-cover" src={photoUrl} /><button aria-label="사진 제거" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-slate-950/70 text-white" onClick={() => { URL.revokeObjectURL(photoUrl); setPhotoUrl(""); onPhotoChange(); }} type="button"><X className="h-4 w-4" /></button></div> : null}
  </div>;
}
