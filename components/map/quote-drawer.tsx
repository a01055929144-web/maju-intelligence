"use client";
import { MoneyInput } from "@/components/money-input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { copyText } from "@/lib/copy-text";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  
  
  
  
  
  
  CheckCircle2,
  
  
  
  Copy,
  Download,
  
  
  
  
  FileImage,
  
  
  
  Link2,
  Loader2,
  
  
  Maximize2,
  Minimize2,
  
  
  MessageCircle,
  
  
  
  
  
  Plus,
  
  RefreshCw,
  
  
  
  
  
  
  
  
  
  
  
  X,
} from "lucide-react";
import {
  QUOTE_MARGIN_PRESETS,
  calculateQuoteLine,
  calculateQuoteTotals,
  calculateSalesPrice,
  normalizeProductToken,
  resolveQuoteValidUntil,
  toCustomerQuoteLines,
  type QuoteLine,
  type SalesQuoteFieldErrors
} from "@/domains/quote/quote";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";
import { buildOutboundItemNotes, buildQuoteDraftRows, buildQuoteShareText, escapeHtml, deleteQuoteDraftFromLocal, quoteDraftId, readQuoteDraft, saveQuoteDraftToLocal, type QuoteSubject } from "@/components/map/quote-draft";
// M8(45-3h): 견적 창. 열 때만 내려받는다. 워크스페이스를 import하지 않는다.
/** 업종/메뉴 정보를 바탕으로 견적서 초안을 만드는 공용 드로어입니다. 신규 리드 카드·거래처 카드
 * 어디서나 열 수 있고, 저장은 하지 않고 화면에서 편집 후 엑셀로 내려받는 v1입니다. */
export function QuoteDrawer({
  companyId,
  companyName = "당사",
  onClose,
  subject
}: {
  readonly companyId?: string;
  readonly companyName?: string;
  readonly onClose: () => void;
  readonly subject: QuoteSubject;
}) {
  const draftKey = quoteDraftId(subject);
  const initialRows = buildQuoteDraftRows(subject.industry, 12);
  const initialMenuNotes = subject.menuNotes || "";
  const initialMarginRate = 12;
  const initialValidDays = 14;
  const initialRecommendationCount = 10;
  const initialRecommendationBasis = "";
  const [defaultMarginRate, setDefaultMarginRate] = useState(12);
  const [validDays, setValidDays] = useState(14);
  const [rows, setRows] = useState<QuoteLine[]>(initialRows);
  const [menuNotes, setMenuNotes] = useState(initialMenuNotes);
  const [quoteMessage, setQuoteMessage] = useState("");
  const [quoteFieldErrors, setQuoteFieldErrors] = useState<SalesQuoteFieldErrors>({});
  const [savedAt, setSavedAt] = useState("");
  const [recommendationCount, setRecommendationCount] = useState<10 | 20 | 30>(10);
  const [recommendationBasis, setRecommendationBasis] = useState("");
  const [isRecommending, setIsRecommending] = useState(false);
  const [catalog, setCatalog] = useState<Array<{ costOptions?: Array<{ cost: number; isDefault: boolean; supplierName: string }>; id: string; matchStatus: QuoteLine["matchStatus"]; name: string; purchasePrice: number; salesName?: string; salesPrice?: number; spec?: string; unit: string }>>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [serverQuoteId, setServerQuoteId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [savedEditorSnapshot, setSavedEditorSnapshot] = useState(() =>
    JSON.stringify({ defaultMarginRate: initialMarginRate, menuNotes: initialMenuNotes, recommendationBasis: initialRecommendationBasis, recommendationCount: initialRecommendationCount, rows: initialRows, validDays: initialValidDays })
  );
  const quoteImageRef = useRef<HTMLDivElement>(null);
  const editorSnapshot = useMemo(
    () => JSON.stringify({ defaultMarginRate, menuNotes, recommendationBasis, recommendationCount, rows, validDays }),
    [defaultMarginRate, menuNotes, recommendationBasis, recommendationCount, rows, validDays]
  );
  const isQuoteDirty = editorSnapshot !== savedEditorSnapshot;
  useUnsavedChangesWarning(isQuoteDirty);
  const { confirm, confirmDialog } = useConfirm();

  async function requestClose() {
    if (isQuoteDirty && !(await confirm({ body: "저장하지 않은 변경사항이 있습니다. 나가시겠습니까?", confirmLabel: "나가기", tone: "default" }))) return;
    onClose();
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
    const draft = readQuoteDraft(subject);
    if (draft && !(await confirm({ body: "작성 중인 견적이 있습니다. 불러올까요?", confirmLabel: "불러오기", tone: "default" }))) return;
    if (cancelled) return;
    const nextMarginRate = draft?.defaultMarginRate || 12;
    const nextRows = draft?.rows || buildQuoteDraftRows(subject.industry, nextMarginRate);
    const nextMenuNotes = draft?.menuNotes || subject.menuNotes || "";
    const nextValidDays = draft?.validDays || 14;
    const nextRecommendationCount = draft?.recommendationCount || 10;
    const nextRecommendationBasis = draft?.recommendationBasis || "";
    setDefaultMarginRate(nextMarginRate);
    setValidDays(nextValidDays);
    setRows(nextRows);
    setMenuNotes(nextMenuNotes);
    setSavedAt(draft?.savedAt || "");
    setRecommendationCount(nextRecommendationCount);
    setRecommendationBasis(nextRecommendationBasis);
    setSavedEditorSnapshot(JSON.stringify({ defaultMarginRate: nextMarginRate, menuNotes: nextMenuNotes, recommendationBasis: nextRecommendationBasis, recommendationCount: nextRecommendationCount, rows: nextRows, validDays: nextValidDays }));
    setPublishedUrl("");
    setQuoteMessage(draft ? "저장된 제안서 초안을 불러왔습니다." : "");
    })();
    return () => { cancelled = true; };
  }, [confirm, draftKey, subject]);

  useEffect(() => {
    if (!isQuoteDirty) return;
    const timer = window.setTimeout(() => {
      try {
        saveQuoteDraftToLocal(subject, { menuNotes, recommendationBasis, recommendationCount, rows, savedAt: new Date().toISOString(), subject, defaultMarginRate, validDays, validUntil: resolveQuoteValidUntil(validDays) });
      } catch {
        // 브라우저 저장 공간이 제한돼도 서버 저장·발행 흐름은 계속 사용할 수 있습니다.
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [defaultMarginRate, isQuoteDirty, menuNotes, recommendationBasis, recommendationCount, rows, subject, validDays]);

  useEffect(() => {
    if (readQuoteDraft(subject)) return;
    let cancelled = false;
    void fetch("/api/customer/settings", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled || !payload?.company) return;
        const margin = [10, 12, 15].includes(Number(payload.company.defaultQuoteMarginPercent)) ? Number(payload.company.defaultQuoteMarginPercent) : 12;
        const days = [7, 14, 30].includes(Number(payload.company.defaultQuoteValidDays)) ? Number(payload.company.defaultQuoteValidDays) : 14;
        setDefaultMarginRate(margin);
        setValidDays(days);
        setRows((current) => {
          const nextRows = current.map((row) => ({ ...row, marginRate: margin, unitPrice: calculateSalesPrice(row.purchasePrice, margin) }));
          setSavedEditorSnapshot(JSON.stringify({ defaultMarginRate: margin, menuNotes: subject.menuNotes || "", recommendationBasis: "", recommendationCount: 10, rows: nextRows, validDays: days }));
          return nextRows;
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [draftKey, subject]);

  async function loadProductCatalog() {
    setCatalogLoading(true);
    try {
      const response = await fetch("/api/product-catalog", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { items?: typeof catalog; message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "매입 상품 원장을 불러오지 못했습니다.");
      const items = payload?.items || [];
      setCatalog(items);
      setRows((current) => current.map((row) => {
        const token = normalizeProductToken(row.item);
        const match = items.find((item) => token && [item.name, item.salesName || ""].some((name) => normalizeProductToken(name) === token));
        if (!match) return row;
        return {
          ...row,
          catalogProductId: match.id,
          item: match.salesName || match.name,
          matchStatus: "matched",
          purchasePrice: match.purchasePrice,
          spec: match.spec || row.spec,
          unit: match.unit || row.unit,
          unitPrice: match.salesPrice || calculateSalesPrice(match.purchasePrice, row.marginRate)
        };
      }));
      setQuoteMessage(items.length ? `매입 상품 원장 ${items.length}개를 불러와 같은 품목을 자동 매칭했습니다.` : "매입 상품 원장에 등록된 품목이 없습니다.");
    } catch (error) {
      setQuoteMessage(error instanceof Error ? error.message : "매입 상품 원장을 불러오지 못했습니다.");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function applyRecommendedProducts(count: 10 | 20 | 30) {
    setRecommendationCount(count);
    setIsRecommending(true);
    setQuoteMessage("");
    try {
      const response = await fetch("/api/assistant/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          count,
          industry: subject.industry,
          menuSummary: menuNotes,
          reviewKeywords: subject.reviewKeywords,
          reviewSummary: subject.reviewSummary
        })
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        recommendations?: Array<{ item?: string; reason?: string }>;
        sourceLabel?: string;
      } | null;
      if (!response.ok || !payload?.recommendations) {
        setQuoteMessage(payload?.message || "추천 품목을 불러오지 못했습니다.");
        return;
      }
      setRows(
        payload.recommendations.map((recommendation, index) => ({
          id: `recommended-${Date.now()}-${index}`,
          item: recommendation.item || "",
          marginRate: defaultMarginRate,
          matchStatus: "unmatched",
          purchasePrice: 0,
          qty: 1,
          spec: "",
          unit: "",
          unitPrice: 0
        }))
      );
      setRecommendationBasis(payload.sourceLabel || "추천 데이터 기반");
      setSavedAt("");
      setQuoteMessage(`${payload.recommendations.length}개 추천 품목을 적용했습니다.`);
    } catch {
      setQuoteMessage("추천 품목 요청 중 오류가 발생했습니다.");
    } finally {
      setIsRecommending(false);
    }
  }

  function updateRow(id: string, patch: Partial<QuoteLine>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function updateRowPurchasePrice(id: string, purchasePrice: number) {
    setRows((current) => current.map((row) => row.id === id
      ? { ...row, purchasePrice, unitPrice: calculateSalesPrice(purchasePrice, row.marginRate) }
      : row));
  }
  function updateRowMargin(id: string, marginRate: number) {
    setRows((current) => current.map((row) => row.id === id
      ? { ...row, marginRate, unitPrice: calculateSalesPrice(row.purchasePrice, marginRate) }
      : row));
  }
  function applyDefaultMargin(marginRate: number) {
    setDefaultMarginRate(marginRate);
    setRows((current) => current.map((row) => ({
      ...row,
      marginRate,
      unitPrice: calculateSalesPrice(row.purchasePrice, marginRate)
    })));
  }
  function addRow() {
    setRows((current) => [...current, {
      id: `row-${Date.now()}`,
      item: "",
      marginRate: defaultMarginRate,
      matchStatus: "requested",
      purchasePrice: 0,
      qty: 1,
      spec: "",
      unit: "",
      unitPrice: 0
    }]);
  }
  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  const quoteTotals = calculateQuoteTotals(rows);
  const customerRows = toCustomerQuoteLines(rows);
  const total = quoteTotals.salesAmount;
  const validUntil = resolveQuoteValidUntil(validDays);
  const shareText = buildQuoteShareText(companyName, subject, rows, menuNotes, total, validUntil);
  const customerShareText = publishedUrl ? `${shareText}\n\n견적서 보기: ${publishedUrl}` : shareText;

  async function persistQuote(status: "draft" | "sent") {
    const nextErrors: SalesQuoteFieldErrors = {};
    if (!subject.customerId && !subject.leadId) nextErrors.subject = "리드 또는 거래처를 연결해 주세요.";
    if (!customerRows.length) {
      nextErrors.items = "저장할 견적 품목을 먼저 입력해주세요.";
    }
    if (!Number.isFinite(defaultMarginRate) || defaultMarginRate < 0 || defaultMarginRate > 90) nextErrors.margin = "마진율은 0~90% 사이여야 합니다.";
    setQuoteFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setQuoteMessage(Object.values(nextErrors)[0] || "입력값을 확인해 주세요."); return; }
    setPublishing(true);
    setQuoteMessage("");
    try {
      const response = await fetch(serverQuoteId ? `/api/sales-quotes/${encodeURIComponent(serverQuoteId)}` : "/api/sales-quotes", {
        method: serverQuoteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: subject.customerId,
          defaultMarginPercent: defaultMarginRate,
          items: rows.filter((row) => row.item.trim()).map((row) => ({
            isCustomRequest: row.matchStatus === "requested",
            marginPercent: row.marginRate,
            productCatalogId: row.catalogProductId,
            productName: row.item.trim(),
            purchaseUnitPrice: row.purchasePrice,
            quantity: row.qty,
            salesUnitPrice: row.unitPrice,
            specification: row.spec,
            unit: row.unit
          })),
          leadId: subject.leadId,
          memo: menuNotes,
          recipientName: subject.name,
          recipientPhone: subject.phone,
          status,
          validUntil
        })
      });
      const payload = (await response.json().catch(() => null)) as { fieldErrors?: SalesQuoteFieldErrors; id?: string; message?: string; publicUrl?: string } | null;
      if (payload?.fieldErrors) setQuoteFieldErrors(payload.fieldErrors);
      if (!response.ok || !payload?.id) throw new Error(payload?.message || "견적을 저장하지 못했습니다.");
      setServerQuoteId(payload.id);
      setPublishedUrl(status === "sent" ? payload.publicUrl || "" : "");
      setSavedEditorSnapshot(editorSnapshot);
      setQuoteFieldErrors({});
      deleteQuoteDraftFromLocal(subject);
      if (status === "sent" && payload.publicUrl) await copyText(payload.publicUrl);
      setQuoteMessage(status === "draft" ? "견적을 임시저장했습니다. 고객에게는 공개되지 않습니다." : "유효기간이 적용된 거래처용 링크를 저장하고 복사했습니다.");
    } catch (error) {
      setQuoteMessage(error instanceof Error ? error.message : "견적을 저장하지 못했습니다.");
    } finally {
      setPublishing(false);
    }
  }

  async function downloadQuoteExcel() {
    const writeXlsxFileModule = await import("write-excel-file/browser");
    const headerRow = ["품목명·규격", "수량", "단가", "공급가액"].map((value) => ({ fontWeight: "bold" as const, value }));
    const dataRows = customerRows.map((row) => [
      { value: row.item },
      { value: `${row.spec}${row.unit ? ` / ${row.unit}` : ""}`.trim() },
      { value: row.qty },
      { value: row.unitPrice },
      { value: row.amount }
    ]);
    const totalRow = [{ value: "합계" }, { value: "" }, { value: "" }, { value: "" }, { value: total }];
    await writeXlsxFileModule
      .default([[...headerRow.slice(0, 1), { fontWeight: "bold" as const, value: "규격·단위" }, ...headerRow.slice(1)], ...dataRows, totalRow], { sheet: "견적서" })
      .toFile(`${subject.name}_견적서.xlsx`);
  }

  async function downloadQuoteImage() {
    if (!quoteImageRef.current) return;
    setQuoteMessage("");
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(quoteImageRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2
      });
      const link = document.createElement("a");
      const safeName = subject.name.replace(/[\\/:*?"<>|]/g, "_").trim() || "거래처";
      link.download = `${safeName}_견적서.png`;
      link.href = dataUrl;
      link.click();
      setQuoteMessage("견적서 이미지를 저장했습니다.");
    } catch {
      setQuoteMessage("견적서 이미지 생성에 실패했습니다.");
    }
  }

  async function copyQuoteText() {
    setQuoteMessage((await copyText(customerShareText)) ? "제안서 문안을 복사했습니다." : "복사 권한이 없어 직접 선택해서 복사해주세요.");
  }

  async function shareQuote() {
    if (!navigator.share) {
      await copyQuoteText();
      setQuoteMessage("공유 기능을 지원하지 않는 환경이라 거래처용 문안을 복사했습니다.");
      return;
    }
    try {
      await navigator.share({ text: customerShareText, title: `${subject.name} 견적서`, url: publishedUrl || undefined });
      setQuoteMessage("공유 화면을 열었습니다. 카카오톡 또는 메시지를 선택하세요.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setQuoteMessage("공유 화면을 열지 못했습니다. 문안 복사를 이용해주세요.");
    }
  }

  function saveQuoteDraft() {
    const nextSavedAt = new Date().toISOString();
    saveQuoteDraftToLocal(subject, {
      menuNotes,
      recommendationBasis,
      recommendationCount,
      rows,
      savedAt: nextSavedAt,
      subject,
      defaultMarginRate,
      validDays,
      validUntil
    });
    setSavedAt(nextSavedAt);
    setSavedEditorSnapshot(editorSnapshot);
    setQuoteMessage("이 브라우저에 제안서 초안을 저장했습니다.");
  }

  function resetQuoteDraft() {
    const nextRows = buildQuoteDraftRows(subject.industry, 12);
    const nextMenuNotes = subject.menuNotes || "";
    deleteQuoteDraftFromLocal(subject);
    setDefaultMarginRate(12);
    setValidDays(14);
    setRows(nextRows);
    setMenuNotes(nextMenuNotes);
    setRecommendationCount(10);
    setRecommendationBasis("");
    setSavedAt("");
    setSavedEditorSnapshot(JSON.stringify({ defaultMarginRate: 12, menuNotes: nextMenuNotes, recommendationBasis: "", recommendationCount: 10, rows: nextRows, validDays: 14 }));
    setQuoteMessage("저장된 초안을 지우고 추천 품목으로 다시 시작합니다.");
  }

  function printQuoteDraft() {
    const printableRows = customerRows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.item)}</td><td>${escapeHtml([row.spec, row.unit].filter(Boolean).join(" / ") || "-")}</td><td>${row.qty}</td><td>${row.unitPrice ? row.unitPrice.toLocaleString() : "-"}</td><td>${row.amount.toLocaleString()}</td></tr>`
      )
      .join("");
    const printWindow = window.open("", "_blank", "width=860,height=1000");
    if (!printWindow) {
      setQuoteMessage("팝업이 차단되어 인쇄 화면을 열지 못했습니다.");
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(subject.name)} 제안서</title><style>
      body{font-family:Arial,'Malgun Gothic',sans-serif;margin:40px;color:#0f172a}
      h1{font-size:26px;margin:0 0 8px} .meta{color:#475569;font-size:13px;line-height:1.7;margin-bottom:24px}
      .box{border:1px solid #dbe3ef;border-radius:12px;padding:16px;margin:16px 0;background:#f8fafc}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
      th,td{border-bottom:1px solid #e2e8f0;padding:10px;text-align:left} th{background:#f1f5f9}
      .total{text-align:right;font-weight:800;margin-top:16px}.footer{margin-top:32px;color:#64748b;font-size:12px}
    </style></head><body>
      <h1>${escapeHtml(subject.name)} 제안서</h1>
      <div class="meta">${subject.industry ? `업종: ${escapeHtml(subject.industry)}<br/>` : ""}${subject.address ? `주소: ${escapeHtml(subject.address)}<br/>` : ""}${subject.phone ? `연락처: ${escapeHtml(subject.phone)}<br/>` : ""}</div>
      <div class="box"><strong>메뉴/리뷰 메모</strong><br/>${escapeHtml(menuNotes || "현장 확인 후 업데이트")}</div>
      <table><thead><tr><th>상품명</th><th>규격·단위</th><th>수량</th><th>판매단가</th><th>금액</th></tr></thead><tbody>${printableRows || "<tr><td colspan='5'>추천 품목을 추가하세요.</td></tr>"}</tbody></table>
      <p class="total">합계 ${total.toLocaleString()}원</p>
      <p class="footer">견적 유효기간: ${new Date(validUntil).toLocaleDateString("ko-KR")}까지 · 실제 납품 조건은 협의 후 확정합니다.</p>
    </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setQuoteMessage("인쇄 화면을 열었습니다. PDF 저장은 인쇄 창에서 선택하세요.");
  }

  return (
    <>
    <div className={`fixed inset-0 z-40 flex bg-slate-950/45 ${isExpanded ? "items-stretch justify-center p-3 sm:p-6" : "justify-end"}`} onClick={requestClose}>
      <div className={`h-full w-full overflow-y-auto bg-white shadow-2xl ${isExpanded ? "max-w-[1440px] rounded-2xl" : "max-w-lg"}`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-teal-700">견적서 초안</p>
            <h3 className="mt-1 truncate text-lg font-black text-slate-950">{subject.name}</h3>
            {subject.industry ? <p className="mt-0.5 text-xs font-bold text-slate-500">{subject.industry} 업종 추천 품목으로 초안을 채웠습니다.</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button className="maju-button-secondary h-8 px-2.5 text-[11px]" onClick={() => setIsExpanded((current) => !current)} type="button">
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isExpanded ? "좁게 보기" : "확장해서 보기"}
            </button>
            <button aria-label="닫기" className="maju-button-secondary h-8 w-8 px-0" onClick={requestClose} type="button">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black text-teal-900">아웃바운드 제안 흐름</p>
              {savedAt ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-teal-800 ring-1 ring-inset ring-teal-100">
                  저장됨 {new Date(savedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(subject.outboundNotes?.length ? subject.outboundNotes : buildOutboundItemNotes(subject.industry)).slice(0, 5).map((note) => (
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-teal-800 ring-1 ring-inset ring-teal-100" key={note}>
                  {note}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-semibold leading-5 text-teal-800">
              메뉴판·리뷰 확인 후 자주 쓰는 품목만 남기고, 단가를 입력한 뒤 DM 문안 복사 또는 PDF 저장으로 현장 영업에 사용합니다.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-black text-slate-700">메뉴 메모 (아는 만큼 적어두면 다음에 참고할 수 있어요)</p>
            <textarea
              className="h-16 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
              onChange={(event) => setMenuNotes(event.target.value)}
              placeholder="예: 김치찌개, 된장찌개, 제육볶음 등"
              value={menuNotes}
            />
          </div>

          <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-teal-900">메뉴·리뷰 기반 추천</p>
                <p className="mt-1 text-[11px] font-semibold text-teal-700">원하는 품목 수를 누르면 현재 목록을 추천 결과로 바꿉니다.</p>
              </div>
              {recommendationBasis ? <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-teal-800 ring-1 ring-inset ring-teal-100">{recommendationBasis}</span> : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([10, 20, 30] as const).map((count) => (
                <button
                  className={`h-8 rounded-md border text-xs font-black transition ${recommendationCount === count && recommendationBasis ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-800 hover:border-teal-400"}`}
                  disabled={isRecommending}
                  key={count}
                  onClick={() => void applyRecommendedProducts(count)}
                  type="button"
                >
                  {isRecommending && recommendationCount === count ? "추천 중..." : `${count}개 추천`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-slate-800">내부 가격 설정</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">매입가와 이익 정보는 거래처용 파일·공유 문안에서 제외됩니다.</p>
              </div>
              <div className="flex gap-1.5">
                {QUOTE_MARGIN_PRESETS.map((rate) => (
                  <button
                    className={`h-8 rounded-md border px-3 text-xs font-black ${defaultMarginRate === rate ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                    key={rate}
                    onClick={() => applyDefaultMargin(rate)}
                    type="button"
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
            {quoteFieldErrors.margin ? <p className="mt-2 text-[11px] font-bold text-rose-700">{quoteFieldErrors.margin}</p> : null}
            <label className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
              견적 유효기간
              <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-800" onChange={(event) => setValidDays(Number(event.target.value))} value={validDays}>
                <option value={7}>7일</option><option value={14}>14일</option><option value={30}>30일</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div><p className="text-xs font-black text-slate-700">실제 매입 상품 연결</p><p className="text-xs font-semibold text-slate-400">업로드된 상품명과 일치하는 품목의 매입가를 적용합니다.</p></div>
              <button className="maju-button-secondary h-8 px-3 text-xs" disabled={catalogLoading} onClick={() => void loadProductCatalog()} type="button">
                {catalogLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {catalogLoading ? "불러오는 중" : catalog.length ? `원장 ${catalog.length}개 다시 매칭` : "매입 원장 불러오기"}
              </button>
            </div>
            {isExpanded ? <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full border-separate border-spacing-0 text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-black text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-2">상품명</th>
                  <th className="w-24 border-b border-slate-200 px-2 py-2">규격</th>
                  <th className="w-16 border-b border-slate-200 px-2 py-2">단위</th>
                  <th className="w-14 border-b border-slate-200 px-2 py-2">수량</th>
                  <th className="w-24 border-b border-slate-200 px-2 py-2">매입가</th>
                  <th className="w-20 border-b border-slate-200 px-2 py-2">마진율</th>
                  <th className="w-24 border-b border-slate-200 px-2 py-2">판매가</th>
                  <th className="w-24 border-b border-slate-200 px-2 py-2">예상 이익</th>
                  <th className="w-10 border-b border-slate-200 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-slate-100 last:border-0" key={row.id}>
                    <td className="px-2 py-1.5">
                      <input
                        className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs font-bold outline-none focus:border-teal-300"
                        onChange={(event) => updateRow(row.id, { item: event.target.value })}
                        placeholder="예: 쌀 20kg"
                        value={row.item}
                      />
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-black ${row.matchStatus === "matched" ? "bg-emerald-50 text-emerald-700" : row.matchStatus === "requested" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                          {row.matchStatus === "matched" ? "원장 매칭" : row.matchStatus === "requested" ? "추가 의뢰" : "매칭 필요"}
                        </span>
                        {row.matchStatus === "requested" ? (
                          <label className="cursor-pointer text-xs font-black text-teal-700">
                            {row.requestPhotoName || "사진 첨부"}
                            <input accept="image/*" className="sr-only" onChange={(event) => updateRow(row.id, { requestPhotoName: event.target.files?.[0]?.name || "" })} type="file" />
                          </label>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5"><input className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs font-bold" onChange={(event) => updateRow(row.id, { spec: event.target.value })} placeholder="18L" value={row.spec} /></td>
                    <td className="px-2 py-1.5"><input className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs font-bold" onChange={(event) => updateRow(row.id, { unit: event.target.value })} placeholder="통" value={row.unit} /></td>
                    <td className="px-2 py-1.5">
                      <input
                        className="h-7 w-full rounded border border-slate-200 px-1.5 text-right text-xs font-bold outline-none focus:border-teal-300"
                        onChange={(event) => updateRow(row.id, { qty: Number(event.target.value) || 0 })}
                        type="number"
                        value={row.qty}
                      />
                    </td>
                    <td className="px-2 py-1.5"><MoneyInput ariaLabel="매입가" className="h-7 w-full rounded border border-slate-200 px-1.5 text-right text-xs font-bold" onCommit={(next) => updateRowPurchasePrice(row.id, next ?? 0)} value={row.purchasePrice} />{row.catalogProductId ? <p className="mt-1 max-w-32 truncate text-xs text-slate-400" title={(catalog.find(item=>item.id===row.catalogProductId)?.costOptions||[]).map(option=>`${option.supplierName} ${option.cost.toLocaleString()}원`).join(" · ")}>{(catalog.find(item=>item.id===row.catalogProductId)?.costOptions||[]).length ? `유통사 원가 ${(catalog.find(item=>item.id===row.catalogProductId)?.costOptions||[]).length}개 비교` : "확정 원가 없음"}</p>:null}</td>
                    <td className="px-2 py-1.5"><input className="h-7 w-full rounded border border-slate-200 px-1.5 text-right text-xs font-bold" onChange={(event) => updateRowMargin(row.id, Number(event.target.value) || 0)} type="number" value={row.marginRate} /></td>
                    <td className="px-2 py-1.5">
                      <MoneyInput ariaLabel="판매단가" className="h-7 w-full rounded border border-slate-200 px-1.5 text-right text-xs font-bold outline-none focus:border-teal-300" onCommit={(next) => updateRow(row.id, { unitPrice: next ?? 0 })} value={row.unitPrice} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-black text-slate-700">{calculateQuoteLine(row).expectedProfit.toLocaleString()}원</td>
                    <td className="px-2 py-1.5 text-center">
                      <button aria-label="삭제" className="grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeRow(row.id)} type="button">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div> : (
              <div className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <div className="space-y-2.5 p-3" key={row.id}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <label className="text-xs font-black text-slate-500">상품명</label>
                        <input
                          className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs font-bold outline-none focus:border-teal-300"
                          onChange={(event) => updateRow(row.id, { item: event.target.value })}
                          placeholder="예: 쌀 20kg"
                          value={row.item}
                        />
                      </div>
                      <button aria-label={`${row.item || "품목"} 삭제`} className="mt-5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeRow(row.id)} type="button">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-xs font-black text-slate-500">
                        수량
                        <input className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-right text-xs font-bold" onChange={(event) => updateRow(row.id, { qty: Number(event.target.value) || 0 })} type="number" value={row.qty} />
                      </label>
                      <label className="text-xs font-black text-slate-500">
                        판매가
                        <input className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-right text-xs font-bold" onChange={(event) => updateRow(row.id, { unitPrice: Number(event.target.value) || 0 })} type="number" value={row.unitPrice} />
                      </label>
                      <div className="text-xs font-black text-slate-500">
                        금액
                        <p className="mt-1 flex h-8 items-center justify-end rounded-md bg-slate-50 px-2 text-xs text-slate-800">{(row.qty * row.unitPrice).toLocaleString()}원</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                      <span>{[row.spec, row.unit].filter(Boolean).join(" · ") || "규격·단위는 확장 보기에서 편집"}</span>
                      <span className={`rounded px-1.5 py-0.5 font-black ${row.matchStatus === "matched" ? "bg-emerald-50 text-emerald-700" : row.matchStatus === "requested" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                        {row.matchStatus === "matched" ? "원장 매칭" : row.matchStatus === "requested" ? "추가 의뢰" : "매칭 필요"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="flex w-full items-center justify-center gap-1.5 border-t border-slate-200 py-2 text-xs font-black text-teal-700 hover:bg-teal-50/50" onClick={addRow} type="button">
              <Plus className="h-3.5 w-3.5" />
              품목 추가
            </button>
          </div>
          {quoteFieldErrors.subject ? <p className="text-xs font-bold text-rose-700">{quoteFieldErrors.subject}</p> : null}
          {quoteFieldErrors.items ? <p className="text-xs font-bold text-rose-700">{quoteFieldErrors.items}</p> : null}
          {quoteFieldErrors.validUntil ? <p className="text-xs font-bold text-rose-700">{quoteFieldErrors.validUntil}</p> : null}

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
            <p><span className="block font-bold text-slate-400">총 매입가</span><strong className="mt-1 block text-slate-800">{quoteTotals.purchaseAmount.toLocaleString()}원</strong></p>
            <p><span className="block font-bold text-slate-400">총 판매가</span><strong className="mt-1 block text-slate-950">{quoteTotals.salesAmount.toLocaleString()}원</strong></p>
            <p><span className="block font-bold text-slate-400">예상 이익</span><strong className="mt-1 block text-teal-800">{quoteTotals.expectedProfit.toLocaleString()}원</strong></p>
            <p><span className="block font-bold text-slate-400">전체 이익률</span><strong className="mt-1 block text-teal-800">{quoteTotals.marginRate.toFixed(1)}%</strong></p>
          </div>

          <div>
            <p className="mb-1 text-xs font-black text-slate-700">DM/문자 제안 문안</p>
            <textarea
              className="h-28 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold leading-5 text-slate-700 outline-none focus:border-teal-300"
              onChange={() => undefined}
              readOnly
              value={customerShareText}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
          <button className="maju-button-secondary w-full disabled:opacity-60" disabled={publishing || !customerRows.length || Boolean(publishedUrl)} onClick={() => void persistQuote("draft")} title={publishedUrl?"발행한 견적은 임시저장으로 되돌릴 수 없습니다.":undefined} type="button">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            임시저장
          </button>
          <button className="maju-button-primary w-full disabled:opacity-60" disabled={publishing || !customerRows.length} onClick={() => void persistQuote("sent")} type="button">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {publishing ? "저장 중" : publishedUrl ? "발행 견적 수정 저장" : "고객용 견적 발행"}
          </button>
          </div>
          {publishedUrl ? <a className="block break-all rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-bold text-teal-800" href={publishedUrl} rel="noreferrer" target="_blank">{publishedUrl}</a> : null}

          <button className="maju-button-primary w-full" onClick={() => void downloadQuoteExcel()} type="button">
            <Download className="h-4 w-4" />
            엑셀로 다운로드
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="maju-button-secondary justify-center text-xs" onClick={() => void copyQuoteText()} type="button">
              <Copy className="h-4 w-4" />
              문안 복사
            </button>
            <button className="maju-button-secondary justify-center text-xs" onClick={() => void shareQuote()} type="button">
              <MessageCircle className="h-4 w-4" />
              카카오톡·메시지 공유
            </button>
            <button className="maju-button-secondary justify-center text-xs" onClick={saveQuoteDraft} type="button">
              <CheckCircle2 className="h-4 w-4" />
              초안 저장
            </button>
            <button className="maju-button-secondary justify-center text-xs" onClick={() => void downloadQuoteImage()} type="button">
              <FileImage className="h-4 w-4" />
              이미지 저장
            </button>
            <button className="maju-button-secondary justify-center text-xs" onClick={printQuoteDraft} type="button">
              <FileImage className="h-4 w-4" />
              PDF/인쇄
            </button>
          </div>
          <button className="w-full rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" onClick={resetQuoteDraft} type="button">
            저장 초안 초기화
          </button>
          {quoteMessage ? <p className="rounded-md bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{quoteMessage}</p> : null}
          <p className="text-[11px] font-semibold text-slate-400">
            매입 상품 원장이 연결되면 매입가를 불러오고, 미매칭 품목은 직접 편집합니다. 거래처용 결과에는 판매가만 표시됩니다.
          </p>

          <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 w-[760px] bg-white p-10 text-slate-950" ref={quoteImageRef}>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">MAJU</p>
            <div className="mt-3 flex items-end justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h1 className="text-3xl font-black">식자재 납품 견적서</h1>
                <p className="mt-2 text-sm font-bold text-slate-500">{subject.name} 귀중</p>
              </div>
              <div className="text-right text-xs font-bold leading-5 text-slate-500">
                <p>공급사: {companyName}</p>
                <p>작성일: {new Date().toLocaleDateString("ko-KR")}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-xs font-bold text-slate-600">
              <p>업종: {subject.industry || "미분류"}</p>
              <p>연락처: {subject.phone || "확인 필요"}</p>
              <p className="col-span-2">주소: {subject.address || "확인 필요"}</p>
              <p className="col-span-2">메뉴·리뷰 메모: {menuNotes || "현장 확인 후 업데이트"}</p>
              <p className="col-span-2">견적 유효기간: {new Date(validUntil).toLocaleDateString("ko-KR")}까지</p>
            </div>
            <table className="mt-6 w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-3">상품명</th>
                  <th className="w-28 p-3">규격·단위</th>
                  <th className="w-20 p-3 text-right">수량</th>
                  <th className="w-28 p-3 text-right">단가</th>
                  <th className="w-32 p-3 text-right">공급가액</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.map((row) => (
                  <tr className="border-b border-slate-200" key={`image-${row.id}`}>
                    <td className="p-3 font-bold">{row.item}</td>
                    <td className="p-3">{[row.spec, row.unit].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="p-3 text-right">{row.qty.toLocaleString()}</td>
                    <td className="p-3 text-right">{row.unitPrice ? `${row.unitPrice.toLocaleString()}원` : "협의"}</td>
                    <td className="p-3 text-right font-black">{row.unitPrice ? `${row.amount.toLocaleString()}원` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-5 flex items-center justify-between rounded-lg bg-teal-50 px-5 py-4">
              <span className="text-sm font-black text-teal-900">견적 합계</span>
              <span className="text-xl font-black text-teal-900">{total.toLocaleString()}원</span>
            </div>
            <p className="mt-6 text-xs font-semibold leading-5 text-slate-500">본 문서는 상담용 초안입니다. 실제 단가, 규격, 납품 주기와 결제 조건은 협의 후 확정됩니다.</p>
          </div>
        </div>
      </div>
    </div>
    {confirmDialog}
    </>
  );
}
