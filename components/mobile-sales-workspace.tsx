"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Bell, CalendarClock, CheckCircle2, ChevronRight, Crosshair, FileText, Loader2, MapPin, MessageCircle, PlusCircle, RefreshCw, Route, Search, Send, Target } from "lucide-react";
import { buildMobileSalesTaskGroups, type MobileSalesTaskKind } from "@/application/mobile-sales/today-tasks";
import { flushMobileSalesActionQueue, readMobileSalesActionQueue, writeMobileSalesActionQueue, type QueuedMobileSalesAction } from "@/application/mobile-sales/action-queue";
import { runBulkActions } from "@/application/mobile-sales/bulk-actions";
import type { KakaoMapMarker } from "@/components/kakao-address-map";
import { MobileSalesBottomNavigation } from "@/components/mobile-sales-bottom-navigation";
import { LeadContactChannelsPanel } from "@/components/lead-contact-channels-panel";
import { LeadStageSelect } from "@/components/lead-stage-select";
import { MobileLocationReporter } from "@/components/mobile-location-reporter";
import { MobileQuoteBuilder } from "@/components/mobile-quote-builder";
import { MobileThemeShell } from "@/components/mobile-theme-shell";
import { buildContactMemo, distanceKm, extractReminderDate, getMobileLeadType, isContactedLead, type MobileLeadSort, type MobileLeadType } from "@/domains/lead/mobile-sales";
import { getDefaultVisitFollowUpDate, getVisitResultDisplayLabel, needsVisitFollowUp, STANDARD_VISIT_RESULTS, VISIT_RESULT_ACTION_TYPE, type StandardVisitResult } from "@/domains/lead/visit-results";
import { formatLeadBusinessHours } from "@/domains/lead/business-hours";
import type { PermitLeadActionItem, PermitLeadItem } from "@/lib/store";
import type { PermitLeadActionKind, PermitLeadActionResult } from "@/components/sales-route-map-workspace";
import { isLeadBusinessHoursDraftEnabled } from "@/lib/feature-modules";
import { createStructuredSaveSnapshot, resolveStructuredSaveAttempt, type StructuredSaveAttempt } from "@/lib/structured-record-idempotency";

type LeadResponse = { leads?: PermitLeadItem[]; message?: string };
type LocationPoint = { latitude: number; longitude: number };
type ViewMode = "all" | MobileLeadType | "route" | "contacted" | "reminder" | MobileSalesTaskKind;
type SalesKpi = { actualContacts: number; actualConversions: number; actualQuotes: number; targetContacts: number; targetConversions: number; targetQuotes: number };

const collateralOptions = ["명함", "견적서", "단가표", "카탈로그", "샘플"] as const;
const COLLATERAL_STORAGE_KEY = "maju:mobile-sales:last-collateral:v1";
const KakaoAddressMap = dynamic(() => import("@/components/kakao-address-map").then((module) => module.KakaoAddressMap), {
  loading: () => <div className="mobile-muted grid h-[260px] place-items-center text-xs font-semibold">지도를 불러오는 중입니다.</div>,
  ssr: false
});

export function MobileSalesWorkspace({ actorName, companyName, holdModulesEnabled = false, initialMode = "sales", kakaoMapAppKey, structuredRecordsEnabled = false }: { actorName: string; companyName: string; holdModulesEnabled?: boolean; initialMode?: MobileLeadType | "route"; kakaoMapAppKey?: string; structuredRecordsEnabled?: boolean }) {
  const [leads, setLeads] = useState<PermitLeadItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>(initialMode);
  const [sort, setSort] = useState<MobileLeadSort>("sales");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [selected, setSelected] = useState<PermitLeadItem | null>(null);
  const [history, setHistory] = useState<PermitLeadActionItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [result, setResult] = useState<StandardVisitResult>("부재");
  const [memo, setMemo] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [collateral, setCollateral] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [salesKpi, setSalesKpi] = useState<SalesKpi | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [issuedQuoteUrl, setIssuedQuoteUrl] = useState("");
  const [convertedCustomerId, setConvertedCustomerId] = useState("");
  const [conversionFailed, setConversionFailed] = useState(false);
  const [businessHoursDraft, setBusinessHoursDraft] = useState("");
  const [businessHoursSaving, setBusinessHoursSaving] = useState(false);
  const [queuedActionCount, setQueuedActionCount] = useState(0);
  const [sampleItem, setSampleItem] = useState("");
  const [sampleQuantity, setSampleQuantity] = useState("");
  const [salesPriceItem, setSalesPriceItem] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [salesPriceValidUntil, setSalesPriceValidUntil] = useState("");
  const [importantNote, setImportantNote] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelection, setBulkSelection] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const structuredSaveAttemptRef = useRef<StructuredSaveAttempt | null>(null);

  const loadLeads = useCallback(async () => {
    setLoadState("loading");
    setError("");
    try {
      const response = await fetch("/api/leads/permits?excludeExcluded=true", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as LeadResponse | null;
      if (!response.ok) throw new Error(payload?.message || "리드를 불러오지 못했습니다.");
      setLeads(payload?.leads || []);
      setLoadState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "리드를 불러오지 못했습니다.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => { void loadLeads(); }, [loadLeads]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(COLLATERAL_STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setCollateral(saved.filter((item): item is string => typeof item === "string" && (collateralOptions as readonly string[]).includes(item)));
    } catch { /* 저장값 손상은 기본 선택으로 복구합니다. */ }
  }, []);
  useEffect(() => {
    const flushQueuedActions = () => {
      const queued = readMobileSalesActionQueue(window.localStorage);
      setQueuedActionCount(queued.length);
      if (!queued.length || !navigator.onLine) return;
      void flushMobileSalesActionQueue(queued, async (item) => {
        try {
          const response = await fetch(`/api/leads/permits/${encodeURIComponent(item.leadId)}/action`, {
            body: JSON.stringify(item.payload), headers: { "Content-Type": "application/json" }, method: "POST"
          });
          return response.ok;
        } catch {
          return false;
        }
      }).then((remaining) => {
        writeMobileSalesActionQueue(window.localStorage, remaining);
        setQueuedActionCount(remaining.length);
        if (remaining.length < queued.length) void loadLeads();
      });
    };
    flushQueuedActions();
    window.addEventListener("online", flushQueuedActions);
    return () => window.removeEventListener("online", flushQueuedActions);
  }, [loadLeads]);
  useEffect(() => {
    void fetch("/api/sales-kpi", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => { if (payload?.kpi) setSalesKpi(payload.kpi); })
      .catch(() => undefined);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage("이 기기에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    setLocationMessage("현재 위치를 확인하는 중입니다.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationMessage("현재 위치 기준 가까운 순을 적용했습니다.");
        setSort("near");
      },
      () => setLocationMessage("위치 권한을 허용하면 가까운 리드를 찾을 수 있습니다."),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
    );
  }, []);

  const visibleLeads = useMemo(() => {
    const taskIds = view === "follow_up" || view === "sms" || view === "dm" || view === "visit"
      ? new Set(buildMobileSalesTaskGroups(leads, leads.length).find((group) => group.kind === view)?.items.map((lead) => lead.id) || [])
      : null;
    const token = query.trim().toLowerCase();
    const filtered = leads.filter((lead) => {
      if (taskIds && !taskIds.has(lead.id)) return false;
      if (view === "new" || view === "sales") if (getMobileLeadType(lead) !== view) return false;
      if (view === "route" && (!lead.address || (distanceKm(location, lead) ?? Number.POSITIVE_INFINITY) > 0.5)) return false;
      if (view === "contacted" && !isContactedLead(lead.status)) return false;
      if (view === "reminder" && lead.status !== "재연락 예정") return false;
      if (!token) return true;
      return [lead.businessName, lead.address, lead.industryPrimary, lead.phone].some((value) => value?.toLowerCase().includes(token));
    });
    return [...filtered].sort((a, b) => {
      if (sort === "near") {
        const aDistance = distanceKm(location, a) ?? Number.POSITIVE_INFINITY;
        const bDistance = distanceKm(location, b) ?? Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;
      }
      return b.scoreTotal - a.scoreTotal;
    });
  }, [leads, location, query, sort, view]);

  const taskGroups = useMemo(() => buildMobileSalesTaskGroups(leads), [leads]);

  const markers = useMemo<KakaoMapMarker[]>(() => visibleLeads.slice(0, 100).map((lead, index) => ({
    address: lead.address || lead.jurisdiction || lead.businessName,
    id: lead.id,
    label: getMobileLeadType(lead) === "new" ? "신규" : "영업",
    leadType: getMobileLeadType(lead),
    lat: lead.latitude,
    lng: lead.longitude,
    markerColor: getMobileLeadType(lead) === "new" ? "#7c3aed" : "#0f766e",
    name: lead.businessName,
    tone: "lead",
    x: 20 + (index % 8) * 9,
    y: 25 + (index % 6) * 9
  })), [visibleLeads]);

  const openLead = useCallback(async (lead: PermitLeadItem) => {
    setSelected(lead);
    setSaveMessage("");
    setHistory([]);
    setHistoryLoading(true);
    setQuoteOpen(false);
    setIssuedQuoteUrl("");
    setConvertedCustomerId("");
    setConversionFailed(false);
    setBusinessHoursDraft("");
    setMemo("");
    setReminderDate("");
    setSampleItem("");
    setSampleQuantity("");
    setSalesPriceItem("");
    setSalesPrice("");
    setSalesPriceValidUntil("");
    setImportantNote("");
    structuredSaveAttemptRef.current = null;
    try {
      const [historyResponse, structuredResponse] = await Promise.all([
        fetch(`/api/leads/permits/${encodeURIComponent(lead.id)}/actions?limit=20`, { cache: "no-store" }),
        structuredRecordsEnabled
          ? fetch(`/api/customer/structured-field-records?kind=lead_sales_offer&leadId=${encodeURIComponent(lead.id)}`, { cache: "no-store" }).catch(() => null)
          : Promise.resolve(null)
      ]);
      const payload = (await historyResponse.json().catch(() => null)) as { actions?: PermitLeadActionItem[] } | null;
      if (historyResponse.ok) setHistory(payload?.actions || []);
      const structuredPayload = structuredResponse?.ok ? await structuredResponse.json().catch(() => null) : null;
      const record = structuredPayload?.record as { items?: Array<{ item_name?: string; offered_price?: number | string; sample_provided?: boolean; sample_quantity?: number | string; valid_until?: string }>; memo?: string } | undefined;
      if (record) {
        const sample = record.items?.find((item) => item.sample_provided);
        const priced = record.items?.find((item) => item.offered_price != null);
        setSampleItem(sample?.item_name || "");
        setSampleQuantity(sample?.sample_quantity == null ? "" : String(sample.sample_quantity));
        setSalesPriceItem(priced?.item_name || "");
        setSalesPrice(priced?.offered_price == null ? "" : String(priced.offered_price));
        setSalesPriceValidUntil(priced?.valid_until || "");
        setImportantNote(record.memo || "");
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [structuredRecordsEnabled]);

  async function saveBusinessHours() {
    if (!selected || !businessHoursDraft.trim()) return;
    setBusinessHoursSaving(true); setSaveMessage("");
    try {
      const response = await fetch(`/api/leads/permits/${encodeURIComponent(selected.id)}/business-hours`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quickInput: businessHoursDraft }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "영업시간을 저장하지 못했습니다.");
      const updated = { ...selected, businessHourIntervals: payload.intervals || [] };
      setSelected(updated); setLeads((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSaveMessage("영업시간을 저장했습니다.");
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : "영업시간을 저장하지 못했습니다."); }
    finally { setBusinessHoursSaving(false); }
  }

  async function convertSelectedLead() {
    if (!selected) return;
    const previewResponse = await fetch(`/api/leads/permits/${encodeURIComponent(selected.id)}/convert`, { cache: "no-store" });
    const preview = previewResponse.ok ? await previewResponse.json().catch(() => null) : null;
    const response = await fetch(`/api/leads/permits/${encodeURIComponent(selected.id)}/convert`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignedStaffMemberId: preview?.recommendation?.assignedStaffMemberId, deliveryTerritoryId: preview?.recommendation?.territoryId })
    });
    const payload = await response.json().catch(() => null) as { customerId?: string; message?: string } | null;
    if (!response.ok || !payload?.customerId) throw new Error(payload?.message || "거래처 연결 실패 — 다시 시도해 주세요.");
    setConvertedCustomerId(payload.customerId); setConversionFailed(false);
  }

  const saveLeadAction = useCallback(async (
    lead: PermitLeadItem,
    actionType: PermitLeadActionKind,
    actionResult?: string,
    actionMemo?: string,
    followUpAt?: string
  ): Promise<PermitLeadActionResult> => {
    try {
      const response = await fetch(`/api/leads/permits/${encodeURIComponent(lead.id)}/action`, {
        body: JSON.stringify({ actionType, followUpAt, memo: actionMemo, result: actionResult }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: PermitLeadActionItem;
        lead?: PermitLeadItem;
        message?: string;
        status?: string;
      } | null;
      if (!response.ok) return { message: payload?.message || "연락 기록을 저장하지 못했습니다.", ok: false };
      const updated = payload?.lead || { ...lead, status: payload?.status || lead.status };
      setLeads((items) => items.map((item) => item.id === lead.id ? updated : item));
      setSelected((current) => current?.id === lead.id ? updated : current);
      if (payload?.action) setHistory((items) => [payload.action!, ...items]);
      setSaveMessage(`${actionResult || "연락"} 기록을 남겼습니다. 결과를 선택해 이어서 기록하세요.`);
      return { ok: true };
    } catch (actionError) {
      return { message: actionError instanceof Error ? actionError.message : "연락 기록을 저장하지 못했습니다.", ok: false };
    }
  }, []);

  async function saveContact(quoteUrl = issuedQuoteUrl, resultOverride?: StandardVisitResult) {
    if (!selected || !memo.trim()) {
      setSaveMessage("컨택 메모를 입력해야 저장할 수 있습니다.");
      return;
    }
    const contactResult = resultOverride || result;
    if (needsVisitFollowUp(contactResult) && !reminderDate) {
      setSaveMessage("후속 날짜를 선택해 주세요.");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    const actionType = VISIT_RESULT_ACTION_TYPE[contactResult];
    const detailLines = [
      sampleItem.trim() ? `[샘플 제공] ${sampleItem.trim()} · ${sampleQuantity.trim() || "수량 확인"}` : "",
      salesPriceItem.trim() ? `[영업 단가] ${salesPriceItem.trim()} · ${salesPrice.trim() || "단가 확인"}${salesPriceValidUntil ? ` · ${salesPriceValidUntil}까지` : ""}` : "",
      importantNote.trim() ? `[중요 특이사항] ${importantNote.trim()}` : ""
    ].filter(Boolean);
    const detailedMemo = [memo.trim(), ...detailLines, quoteUrl ? `[고객용 견적: ${quoteUrl}]` : ""].filter(Boolean).join("\n");
    const actionPayload = { actionType, collateralTypes: collateral, followUpAt: reminderDate || undefined, memo: buildContactMemo({ collateral, memo: detailedMemo, reminderDate }), result: contactResult };
    const structuredItems = [
      sampleItem.trim() ? { itemName: sampleItem.trim(), sampleProvided: true, sampleQuantity: toNumericString(sampleQuantity) || undefined } : null,
      salesPriceItem.trim() ? { itemName: salesPriceItem.trim(), offeredPrice: toNumericString(salesPrice) || undefined, currencyCode: "KRW", validUntil: salesPriceValidUntil || undefined } : null
    ].filter(Boolean);
    const usesStructuredOffer = structuredRecordsEnabled && structuredItems.length > 0;
    const structuredSnapshot = usesStructuredOffer
      ? createStructuredSaveSnapshot({ action: actionPayload, items: structuredItems, leadId: selected.id, memo: actionPayload.memo })
      : "";
    if (usesStructuredOffer) {
      structuredSaveAttemptRef.current = resolveStructuredSaveAttempt(structuredSaveAttemptRef.current, structuredSnapshot);
    }
    try {
      const response = await fetch(usesStructuredOffer ? "/api/customer/structured-field-records" : `/api/leads/permits/${encodeURIComponent(selected.id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usesStructuredOffer ? {
          kind: "lead_sales_offer",
          leadId: selected.id,
          memo: actionPayload.memo,
          idempotencyKey: structuredSaveAttemptRef.current?.key,
          action: actionPayload,
          items: structuredItems
        } : actionPayload)
      });
      const payload = (await response.json().catch(() => null)) as { action?: PermitLeadActionItem; message?: string; status?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "컨택 기록을 저장하지 못했습니다.");
      if (payload?.action) setHistory((current) => [payload.action!, ...current]);
      setLeads((current) => current.map((lead) => lead.id === selected.id ? { ...lead, status: payload?.status || lead.status } : lead));
      setSelected((current) => current ? { ...current, status: payload?.status || current.status } : current);
      try { window.localStorage.setItem(COLLATERAL_STORAGE_KEY, JSON.stringify(collateral)); } catch { /* 브라우저 저장 실패는 기록 저장을 막지 않습니다. */ }
      structuredSaveAttemptRef.current = null;
      if (usesStructuredOffer) {
        await openLead(selected);
        void loadLeads();
      } else {
        setMemo(""); setReminderDate(""); setSampleItem(""); setSampleQuantity(""); setSalesPriceItem(""); setSalesPrice(""); setSalesPriceValidUntil(""); setImportantNote("");
      }
      if (contactResult === "거래 시작") {
        await convertSelectedLead();
        setSaveMessage("거래 시작을 기록하고 거래처·배송지로 연결했습니다. 주소와 배송 설정을 확인하세요.");
      } else {
        setSaveMessage(quoteUrl ? "견적 링크와 컨택 기록이 함께 저장되었습니다." : "방문 기록과 후속 일정이 저장되었습니다.");
      }
    } catch (saveError) {
      if (saveError instanceof TypeError && !usesStructuredOffer) {
        const queued: QueuedMobileSalesAction = { createdAt: new Date().toISOString(), id: crypto.randomUUID(), leadId: selected.id, payload: actionPayload };
        const items = [...readMobileSalesActionQueue(window.localStorage), queued];
        writeMobileSalesActionQueue(window.localStorage, items);
        setQueuedActionCount(items.length);
        setLeads((current) => current.map((lead) => lead.id === selected.id ? { ...lead, status: reminderDate ? "재연락 예정" : "연락 완료" } : lead));
        setSelected((current) => current ? { ...current, status: reminderDate ? "재연락 예정" : "연락 완료" } : current);
        try { window.localStorage.setItem(COLLATERAL_STORAGE_KEY, JSON.stringify(collateral)); } catch { /* 오프라인 큐 저장은 계속 진행합니다. */ }
        setMemo(""); setReminderDate(""); setSampleItem(""); setSampleQuantity(""); setSalesPriceItem(""); setSalesPrice(""); setSalesPriceValidUntil(""); setImportantNote("");
        setSaveMessage("통신이 불안정해 기기에 저장했습니다. 연결되면 자동으로 다시 전송합니다.");
        return;
      }
      if (contactResult === "거래 시작") setConversionFailed(true);
      setSaveMessage(saveError instanceof Error ? saveError.message : "컨택 기록을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }

  const contactedCount = leads.filter((lead) => isContactedLead(lead.status)).length;
  const quoteCount = leads.filter((lead) => ["견적 요청", "견적 발송"].includes(lead.status)).length;
  const reminderCount = leads.filter((lead) => lead.status === "재연락 예정").length;

  async function updateSelectedLeads(actionType: "hold" | "exclude", result: "보류" | "제외") {
    const targets = leads.filter((lead) => bulkSelection.includes(lead.id));
    if (!targets.length || bulkSaving) return;
    if (actionType === "exclude" && !window.confirm(`${targets.length}개 리드를 제외 상태로 변경할까요?`)) return;
    setBulkSaving(true);
    setBulkMessage("");
    const outcomes = await runBulkActions(targets, async (lead) => {
      const response = await fetch(`/api/leads/permits/${encodeURIComponent(lead.id)}/action`, {
        body: JSON.stringify({ actionType, memo: "모바일 목록 일괄 변경", result }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json().catch(() => null) as { lead?: PermitLeadItem; message?: string; status?: string } | null;
      if (!response.ok) throw new Error(payload?.message || `${lead.businessName} 상태를 변경하지 못했습니다.`);
      return payload?.lead || { ...lead, status: payload?.status || result };
    }, 4);
    const failedIds = outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.item.id);
    const updatedById = new Map(outcomes.filter((outcome) => outcome.ok).map((outcome) => [outcome.item.id, outcome.result]));
    setLeads((items) => items.map((item) => updatedById.get(item.id) || item));
    setBulkSaving(false);
    setBulkSelection(failedIds);
    setBulkMessage(failedIds.length ? `${targets.length - failedIds.length}개 변경 · 실패 ${failedIds.length}개 선택 유지` : `${targets.length}개를 ${result} 상태로 변경했습니다.`);
    if (!failedIds.length) setBulkMode(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <MobileThemeShell>
        <section className="mobile-app-frame mx-auto flex min-h-screen w-full max-w-[480px] flex-col shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
          <header className="mobile-card sticky top-0 z-20 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold">MAJU 모바일 영업</p><p className="mobile-muted truncate text-xs font-semibold">{actorName} · {companyName}</p><p className="mt-1 text-[11px] font-black text-emerald-700">● 근무 중</p></div>
              <Link className="mobile-secondary-action inline-flex min-h-10 items-center rounded-lg border px-3 text-xs font-semibold" href="/mobile/today">배송 화면</Link>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2" aria-label="업무 모드">
              <Link className="mobile-secondary-action grid min-h-10 place-items-center rounded-full border text-xs font-bold" href="/mobile/today">배송</Link>
              <button className={`min-h-10 rounded-full text-xs font-bold ${view === "new" ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={() => setView("new")} type="button">신규</button>
              <button className={`min-h-10 rounded-full text-xs font-bold ${view === "sales" ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={() => setView("sales")} type="button">영업</button>
              <button className={`min-h-10 rounded-full text-xs font-bold ${view === "route" ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={() => { setView("route"); requestLocation(); document.getElementById("lead-map")?.scrollIntoView({ behavior: "smooth" }); }} type="button">가는 길</button>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-3 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3">
            <MobileLocationReporter />
            <section className="mobile-card order-1 rounded-xl border p-3" aria-label="오늘 할 일">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">오늘 할 일</p><p className="mobile-muted text-xs">카드를 누르면 바로 실행할 매장만 모아봅니다.</p></div>{queuedActionCount ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">전송 대기 {queuedActionCount}</span> : null}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {taskGroups.map((group) => <TaskCard count={group.count} key={group.kind} kind={group.kind} onClick={() => { setView(group.kind); document.getElementById("lead-list")?.scrollIntoView({ behavior: "smooth" }); }} />)}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="mobile-secondary-action inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border text-xs font-semibold" onClick={() => { setView("visit"); document.getElementById("lead-map")?.scrollIntoView({ behavior: "smooth" }); }} type="button"><Route className="h-4 w-4" />방문 동선</button>
                <Link className="mobile-secondary-action inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border text-xs font-semibold" href="/mobile/register"><PlusCircle className="h-4 w-4" />매장 직접 등록</Link>
              </div>
            </section>
            <section className="mobile-card order-2 rounded-xl border p-3" aria-label="영업 KPI 현황">
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">이번 달 영업 KPI</p><p className="mobile-muted mt-0.5 text-xs">회사 설정 목표 대비 내 영업 실적</p></div><Target className="h-5 w-5 text-teal-700" /></div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Kpi value={salesKpi?.actualContacts ?? contactedCount} target={salesKpi?.targetContacts} label="컨택" />{holdModulesEnabled ? <Kpi value={salesKpi?.actualQuotes ?? quoteCount} target={salesKpi?.targetQuotes} label="견적" /> : null}<Kpi value={salesKpi?.actualConversions || 0} target={salesKpi?.targetConversions} label="전환" /><Kpi value={reminderCount} label="리마인드" />
              </div>
            </section>

            <section className="mobile-card order-3 overflow-hidden rounded-xl border" id="lead-map">
              <div className="flex items-center justify-between border-b border-[var(--mobile-border)] px-3 py-2.5"><div><p className="text-sm font-semibold">내 주변 영업 지도</p><p className="mobile-muted text-xs">보라색 신규 · 청록색 영업 리드</p></div><button className="mobile-secondary-action inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs font-semibold" onClick={requestLocation} type="button"><Crosshair className="h-4 w-4" />내 위치</button></div>
              <KakaoAddressMap appKey={kakaoMapAppKey} focusedMarkerId={selected?.id} mapClassName="h-[clamp(360px,calc(100dvh-14rem),620px)] w-full" markers={markers} onMarkerClick={(marker) => { const lead = leads.find((item) => item.id === marker.id); if (lead) void openLead(lead); }} showList={false} />
              {locationMessage ? <p className="mobile-muted px-3 py-2 text-xs font-semibold">{locationMessage}</p> : null}
            </section>

            <section className="mobile-card order-4 rounded-xl border p-3" id="lead-list">
              <div className="flex items-center gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="리드 검색" className="mobile-input min-h-10 w-full rounded-lg border py-2 pl-9 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="매장명·주소·업종 검색" value={query} /></div><button className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold ${bulkMode ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={() => { setBulkMode((current) => !current); setBulkSelection([]); setBulkMessage(""); }} type="button">{bulkMode ? "선택 취소" : "일괄 변경"}</button></div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className={`min-h-10 rounded-lg text-xs font-semibold ${sort === "sales" ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={() => setSort("sales")} type="button">세일즈 추천</button>
                <button className={`min-h-10 rounded-lg text-xs font-semibold ${sort === "near" ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={requestLocation} type="button">가까운 순</button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {([['all','전체'],['new','신규'],['sales','영업'],['contacted','컨택 이력'],['reminder','리마인드']] as const).map(([value,label]) => <button className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${view === value ? "mobile-accent-soft" : "border border-[var(--mobile-border)]"}`} key={value} onClick={() => setView(value)} type="button">{label}</button>)}
              </div>

              {loadState === "loading" ? <StateMessage icon={Loader2} text="영업 후보를 불러오는 중입니다." spin /> : null}
              {loadState === "error" ? <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700"><p>{error}</p><button className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg bg-white px-3" onClick={() => void loadLeads()} type="button"><RefreshCw className="h-4 w-4" />다시 시도</button></div> : null}
              {bulkMode ? <div className="mobile-card-raised sticky top-2 z-10 mt-3 flex items-center gap-2 rounded-lg border p-2"><span className="mobile-muted mr-auto text-xs font-semibold">{bulkSelection.length}개 선택</span><button className="min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-700 disabled:opacity-50" disabled={!bulkSelection.length || bulkSaving} onClick={() => void updateSelectedLeads("hold", "보류")} type="button">보류</button><button className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-700 disabled:opacity-50" disabled={!bulkSelection.length || bulkSaving} onClick={() => void updateSelectedLeads("exclude", "제외")} type="button">제외</button></div> : null}
              {bulkMessage ? <p aria-live="polite" className="mobile-muted mt-2 text-xs font-semibold">{bulkMessage}</p> : null}
              {loadState === "ready" ? <div className="mt-3 space-y-2">{visibleLeads.slice(0, 50).map((lead) => <LeadCard checked={bulkSelection.includes(lead.id)} key={lead.id} lead={lead} location={location} selectable={bulkMode} onOpen={() => bulkMode ? setBulkSelection((current) => current.includes(lead.id) ? current.filter((id) => id !== lead.id) : [...current, lead.id]) : void openLead(lead)} />)}{visibleLeads.length === 0 ? <StateMessage icon={MapPin} text="조건에 맞는 리드가 없습니다." /> : null}</div> : null}
            </section>

            <section className="mobile-card order-5 rounded-xl border p-3" id="reminders">
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">후속 영업 리마인드</p><p className="mobile-muted text-xs">과거 컨택 후 다시 연락할 매장</p></div><Bell className="h-5 w-5 text-amber-600" /></div>
              <div className="mt-3 space-y-2">{leads.filter((lead) => lead.status === "재연락 예정").slice(0, 10).map((lead) => <button className="mobile-card-raised flex min-h-14 w-full items-center justify-between rounded-lg border px-3 text-left" key={lead.id} onClick={() => void openLead(lead)} type="button"><span><span className="block text-sm font-semibold">{lead.businessName}</span><span className="mobile-muted mt-0.5 block text-xs">{lead.address || "주소 확인 필요"}</span></span><ChevronRight className="h-4 w-4" /></button>)}{reminderCount === 0 ? <p className="mobile-muted rounded-lg border border-dashed border-[var(--mobile-border)] p-3 text-center text-xs font-semibold">등록된 리마인드가 없습니다.</p> : null}</div>
            </section>
          </div>

          <MobileSalesBottomNavigation onQuickRecord={() => { const nearest = visibleLeads[0]; if (nearest) void openLead(nearest); else setLocationMessage("기록할 주변 매장이 없습니다."); }} />
        </section>

        {selected ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${selected.businessName} 컨택 기록`}><div className="mobile-card max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border p-4 sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getMobileLeadType(selected) === "new" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"}`}>{getMobileLeadType(selected) === "new" ? "신규 리드" : "영업 리드"}</span><h2 className="mt-2 text-xl font-bold">{selected.businessName}</h2><p className="mobile-muted mt-1 text-xs font-semibold">{selected.address || "주소 확인 필요"}</p></div><button className="min-h-11 rounded-lg border border-[var(--mobile-border)] px-3 text-xs font-semibold" onClick={() => setSelected(null)} type="button">닫기</button></div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[var(--mobile-border)] p-2"><span className="text-xs font-semibold">영업 상태</span><LeadStageSelect compact lead={selected} onAction={saveLeadAction} /></div>
          <div className="mt-3"><LeadContactChannelsPanel lead={selected} onAction={saveLeadAction} onLeadUpdated={(lead) => { setSelected(lead); setLeads((items) => items.map((item) => item.id === lead.id ? lead : item)); }} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><button className="mobile-secondary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold" onClick={() => document.getElementById("contact-result")?.scrollIntoView({ behavior: "smooth", block: "center" })} type="button"><MapPin className="h-4 w-4" />방문 결과</button><a className="mobile-secondary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold" href={selected.kakaoPlaceUrl || `https://map.kakao.com/?q=${encodeURIComponent(selected.address || selected.businessName)}`} rel="noreferrer" target="_blank"><MapPin className="h-4 w-4" />지도</a></div>
          <div className="mt-4 grid gap-2" aria-label="영업 기록 빠른 묶음">
            <button className="mobile-card-raised min-h-11 rounded-lg border px-3 text-left text-xs font-bold" onClick={() => { setResult("관심"); setCollateral(["명함", "단가표"]); setMemo((value) => value || "방문 상담 완료"); }} type="button">방문 · 명함 · 단가표</button>
            <button className="mobile-card-raised min-h-11 rounded-lg border px-3 text-left text-xs font-bold" onClick={() => { setResult("부재"); setCollateral(["명함"]); setMemo((value) => value || "부재 · 명함 남김"); }} type="button">부재 · 명함 남김</button>
            {holdModulesEnabled ? <button className="mobile-card-raised min-h-11 rounded-lg border px-3 text-left text-xs font-bold" onClick={() => { setResult("단가표 전달"); setCollateral(["견적서"]); setMemo((value) => value || "견적서 전달"); }} type="button">견적서 전달</button> : null}
          </div>
          {isLeadBusinessHoursDraftEnabled() ? <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-950">영업시간·브레이크타임 빠른 입력</p><p className="mt-1 text-[11px] text-amber-800">현재 · {formatLeadBusinessHours(selected.businessHourIntervals || [])}</p><input className="mobile-input mt-2 min-h-11 w-full rounded-lg border px-3 text-sm" onChange={(event) => setBusinessHoursDraft(event.target.value)} placeholder="예: 매일 15:00~17:00 브레이크 · 월 휴무" value={businessHoursDraft} /><button className="mt-2 min-h-10 w-full rounded-lg border bg-white text-xs font-semibold text-amber-800 disabled:opacity-50" disabled={businessHoursSaving || !businessHoursDraft.trim()} onClick={() => void saveBusinessHours()} type="button">{businessHoursSaving ? "저장 중" : "저장"}</button></section> : null}
          <div className="mt-4"><label className="text-xs font-semibold" htmlFor="contact-result">방문 결과</label><select className="mobile-input mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" id="contact-result" onChange={(event) => { const value = event.target.value as StandardVisitResult; setResult(value); if (needsVisitFollowUp(value) && !reminderDate) setReminderDate(getDefaultVisitFollowUpDate()); }} value={result}>{STANDARD_VISIT_RESULTS.map((option) => <option key={option}>{option}</option>)}</select></div>
          <fieldset className="mt-4"><legend className="text-xs font-semibold">전달 자료</legend><div className="mt-2 grid grid-cols-2 gap-2">{collateralOptions.filter((item) => holdModulesEnabled || item !== "견적서").map((item) => <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border text-xs font-semibold ${collateral.includes(item) ? "mobile-accent-soft" : "border-[var(--mobile-border)]"}`} key={item}><input className="sr-only" type="checkbox" checked={collateral.includes(item)} onChange={() => setCollateral((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item === "카탈로그" || item === "단가표" ? <MessageCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{item}</label>)}</div></fieldset>
          <details className="mobile-card-raised mt-4 rounded-xl border p-3">
            <summary className="cursor-pointer text-xs font-bold">샘플 · 영업 단가 · 중요 특이사항</summary>
            <div className="mt-3 grid grid-cols-[1fr_92px] gap-2"><input aria-label="샘플 품목" className="mobile-input min-h-11 rounded-lg border px-3 text-sm" onChange={(event) => setSampleItem(event.target.value)} placeholder="샘플 품목" value={sampleItem} /><input aria-label="샘플 수량" className="mobile-input min-h-11 rounded-lg border px-3 text-sm" onChange={(event) => setSampleQuantity(event.target.value)} placeholder="수량" value={sampleQuantity} /></div>
            <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="영업 단가 품목" className="mobile-input min-h-11 rounded-lg border px-3 text-sm" onChange={(event) => setSalesPriceItem(event.target.value)} placeholder="단가 품목" value={salesPriceItem} /><input aria-label="영업 단가" className="mobile-input min-h-11 rounded-lg border px-3 text-sm" onChange={(event) => setSalesPrice(event.target.value)} placeholder="제시 단가" value={salesPrice} /></div>
            <label className="mt-2 block text-[11px] font-bold">단가 유효 기간<input className="mobile-input mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" onChange={(event) => setSalesPriceValidUntil(event.target.value)} type="date" value={salesPriceValidUntil} /></label>
            <textarea aria-label="중요 특이사항" className="mobile-input mt-2 min-h-20 w-full rounded-lg border p-3 text-sm" onChange={(event) => setImportantNote(event.target.value)} placeholder="상세 맨 위에 고정할 중요 특이사항" value={importantNote} />
          </details>
          <div className="mt-4"><label className="text-xs font-semibold" htmlFor="contact-memo">컨택 메모 <span className="text-rose-600">필수</span></label><textarea className="mobile-input mt-1 min-h-24 w-full rounded-lg border p-3 text-sm" id="contact-memo" onChange={(event) => setMemo(event.target.value)} placeholder="반응, 필요한 품목, 다음 행동을 기록하세요." value={memo} /></div>
          {holdModulesEnabled ? <button className="mobile-secondary-action mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold" onClick={() => { setQuoteOpen((current) => !current); setCollateral((current) => current.includes("견적서") ? current : [...current, "견적서"]); }} type="button"><FileText className="h-4 w-4" />{quoteOpen ? "견적 작성 닫기" : "품목 선택·견적 작성"}</button> : null}
          {holdModulesEnabled && quoteOpen ? <MobileQuoteBuilder contactMemo={memo} leadId={selected.id} onIssued={({ publicUrl }) => { setIssuedQuoteUrl(publicUrl); setCollateral((current) => current.includes("견적서") ? current : [...current, "견적서"]); setSaveMessage("견적 링크가 생성되었습니다. 방문 결과를 선택해 기록하세요."); }} recipientName={selected.businessName} recipientPhone={selected.phone} /> : null}
          {needsVisitFollowUp(result) ? <div className="mt-4"><label className="text-xs font-semibold" htmlFor="reminder-date">후속 일정 <span className="text-rose-600">필수</span></label><input className="mobile-input mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" id="reminder-date" min={new Date().toISOString().slice(0,10)} onChange={(event) => setReminderDate(event.target.value)} type="date" value={reminderDate} /></div> : null}
          {saveMessage ? <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${/실패|입력해|필수/.test(saveMessage) ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{saveMessage}</p> : null}
          {conversionFailed ? <button className="mt-2 min-h-11 w-full rounded-lg border border-rose-200 bg-white text-sm font-semibold text-rose-700" onClick={() => { setSaving(true); void convertSelectedLead().then(() => setSaveMessage("거래처 연결을 완료했습니다.")).catch((error) => setSaveMessage(error instanceof Error ? error.message : "거래처 연결 실패 — 다시 시도해 주세요.")).finally(() => setSaving(false)); }} type="button">거래처 연결 다시 시도</button> : null}
          {convertedCustomerId ? <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-900"><p>배송지 · {selected.address || "주소 확인 필요"}</p><p className="mt-1">권역·오늘 코스는 지도에서 바로 확인하고 수정할 수 있습니다.</p><Link className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-white" href={`/map?view=customers&customerId=${encodeURIComponent(convertedCustomerId)}`}>지도에서 배송 설정</Link></div> : null}
          <button className="mobile-primary-action mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:opacity-60" disabled={saving} onClick={() => void saveContact()} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{saving ? "저장 중" : "컨택 기록 저장"}</button>
          <div className="mt-5 border-t border-[var(--mobile-border)] pt-4"><p className="text-sm font-semibold">과거 컨택 전체 흐름</p>{historyLoading ? <StateMessage icon={Loader2} text="이력을 불러오는 중입니다." spin /> : <div className="mt-2 space-y-2">{history.map((item) => <div className="mobile-card-raised rounded-lg border p-3" key={item.id}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{getVisitResultDisplayLabel(item.result || item.actionType)}</span><span className="mobile-muted text-[11px]">{item.createdAt}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5">{item.memo || "메모 없음"}</p>{extractReminderDate(item.memo) ? <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><CalendarClock className="h-3.5 w-3.5" />{extractReminderDate(item.memo)} 재연락</p> : null}<p className="mobile-muted mt-1 text-[11px]">{item.actorName || "담당자 미확인"}</p></div>)}{history.length === 0 ? <p className="mobile-muted py-4 text-center text-xs">아직 저장된 컨택 이력이 없습니다.</p> : null}</div>}</div>
        </div></div> : null}
      </MobileThemeShell>
    </main>
  );
}

function Kpi({ label, target, value }: { label: string; target?: number; value: number }) { return <div className="mobile-card-raised rounded-lg border px-2 py-3"><p className="text-xl font-bold text-teal-700">{value}{target ? <span className="text-[10px] text-slate-400">/{target}</span> : null}</p><p className="mobile-muted mt-1 text-[11px] font-semibold">{label}</p>{target ? <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, Math.round((value / target) * 100))}%` }} /></span> : null}</div>; }

const taskCardMeta: Record<MobileSalesTaskKind, { label: string; note: string }> = {
  follow_up: { label: "다시 연락", note: "후속 일정이 잡힌 매장" },
  sms: { label: "문자·010", note: "휴대폰 번호가 있는 매장" },
  dm: { label: "DM·톡톡", note: "SNS로 바로 연락 가능" },
  visit: { label: "방문", note: "주소가 확인된 영업 후보" }
};

function TaskCard({ count, kind, onClick }: { count: number; kind: MobileSalesTaskKind; onClick: () => void }) {
  const meta = taskCardMeta[kind];
  return <button className="mobile-card-raised min-h-24 rounded-lg border p-3 text-left" onClick={onClick} type="button"><span className="text-2xl font-bold text-teal-700">{count}</span><span className="mt-1 block text-sm font-semibold">{meta.label}</span><span className="mobile-muted mt-1 block text-[11px]">{meta.note}</span></button>;
}

function StateMessage({ icon: Icon, spin = false, text }: { icon: typeof MapPin; spin?: boolean; text: string }) { return <div className="mobile-muted mt-3 flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--mobile-border)] text-xs font-semibold"><Icon className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} />{text}</div>; }

function toNumericString(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : "";
}

function LeadCard({ checked = false, lead, location, onOpen, selectable = false }: { checked?: boolean; lead: PermitLeadItem; location: LocationPoint | null; onOpen: () => void; selectable?: boolean }) {
  const type = getMobileLeadType(lead);
  const leadDistance = distanceKm(location, lead);
  return (
    <button aria-pressed={selectable ? checked : undefined} className={`mobile-card-raised flex min-h-14 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${checked ? "ring-2 ring-teal-500" : ""}`} onClick={onOpen} type="button">
      {selectable ? <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-[11px] ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-[var(--mobile-border)]"}`}>{checked ? "✓" : ""}</span> : null}
      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${type === "new" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"}`}>{type === "new" ? "신규" : "영업"}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{lead.businessName}</span><span className="mobile-muted block truncate text-[11px]">{lead.status} · {lead.address || lead.jurisdiction || "주소 확인 필요"}</span></span>
      <span className="shrink-0 text-right"><span className="block text-xs font-semibold">{lead.scoreTotal}점</span>{leadDistance != null ? <span className="mobile-muted block text-[10px]">{leadDistance.toFixed(1)}km</span> : null}</span>
      <ChevronRight className="mobile-accent h-4 w-4 shrink-0" />
    </button>
  );
}
