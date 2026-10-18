"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Bell, CalendarClock, CheckCircle2, ChevronRight, Crosshair, FileText, Loader2, MapPin, MessageCircle, Phone, RefreshCw, Search, Send, Target } from "lucide-react";
import type { KakaoMapMarker } from "@/components/kakao-address-map";
import { MobileSalesBottomNavigation } from "@/components/mobile-sales-bottom-navigation";
import { MobileQuoteBuilder } from "@/components/mobile-quote-builder";
import { MobileThemeShell } from "@/components/mobile-theme-shell";
import { buildContactMemo, distanceKm, extractReminderDate, getMobileLeadType, isContactedLead, type MobileLeadSort, type MobileLeadType } from "@/domains/lead/mobile-sales";
import { getDefaultVisitFollowUpDate, getVisitResultDisplayLabel, needsVisitFollowUp, STANDARD_VISIT_RESULTS, VISIT_RESULT_ACTION_TYPE, type StandardVisitResult } from "@/domains/lead/visit-results";
import type { PermitLeadActionItem, PermitLeadItem } from "@/lib/store";
import { isLeadBusinessHoursDraftEnabled } from "@/lib/feature-modules";

type LeadResponse = { leads?: PermitLeadItem[]; message?: string };
type LocationPoint = { latitude: number; longitude: number };
type ViewMode = "all" | MobileLeadType | "contacted" | "reminder";
type SalesKpi = { actualContacts: number; actualConversions: number; actualQuotes: number; targetContacts: number; targetConversions: number; targetQuotes: number };

const collateralOptions = ["브로슈어", "단가표", "견적서", "명함"] as const;
const KakaoAddressMap = dynamic(() => import("@/components/kakao-address-map").then((module) => module.KakaoAddressMap), {
  loading: () => <div className="mobile-muted grid h-[260px] place-items-center text-xs font-semibold">지도를 불러오는 중입니다.</div>,
  ssr: false
});

export function MobileSalesWorkspace({ actorName, companyName, holdModulesEnabled = false }: { actorName: string; companyName: string; holdModulesEnabled?: boolean }) {
  const [leads, setLeads] = useState<PermitLeadItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("all");
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
  const [businessHoursDraft, setBusinessHoursDraft] = useState("");

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
    const token = query.trim().toLowerCase();
    const filtered = leads.filter((lead) => {
      if (view === "new" || view === "sales") if (getMobileLeadType(lead) !== view) return false;
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
    try {
      const response = await fetch(`/api/leads/permits/${encodeURIComponent(lead.id)}/actions?limit=20`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { actions?: PermitLeadActionItem[] } | null;
      if (response.ok) setHistory(payload?.actions || []);
    } finally {
      setHistoryLoading(false);
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
    try {
      const response = await fetch(`/api/leads/permits/${encodeURIComponent(selected.id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, collateralTypes: collateral, followUpAt: reminderDate || undefined, memo: buildContactMemo({ collateral, memo: quoteUrl ? `${memo.trim()}\n[고객용 견적: ${quoteUrl}]` : memo, reminderDate }), result: contactResult })
      });
      const payload = (await response.json().catch(() => null)) as { action?: PermitLeadActionItem; message?: string; status?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "컨택 기록을 저장하지 못했습니다.");
      if (payload?.action) setHistory((current) => [payload.action!, ...current]);
      setLeads((current) => current.map((lead) => lead.id === selected.id ? { ...lead, status: payload?.status || lead.status } : lead));
      setSelected((current) => current ? { ...current, status: payload?.status || current.status } : current);
      setMemo(""); setCollateral([]); setReminderDate("");
      if (contactResult === "거래 시작") {
        const previewResponse = await fetch(`/api/leads/permits/${encodeURIComponent(selected.id)}/convert`, { cache: "no-store" });
        const preview = previewResponse.ok ? await previewResponse.json().catch(() => null) : null;
        const conversionResponse = await fetch(`/api/leads/permits/${encodeURIComponent(selected.id)}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedStaffMemberId: preview?.recommendation?.assignedStaffMemberId,
            deliveryTerritoryId: preview?.recommendation?.territoryId
          })
        });
        const conversion = (await conversionResponse.json().catch(() => null)) as { customerId?: string; message?: string } | null;
        if (!conversionResponse.ok && !conversion?.customerId) throw new Error(conversion?.message || "거래처 전환을 완료하지 못했습니다.");
        setConvertedCustomerId(conversion?.customerId || "");
        setSaveMessage("거래 시작을 기록하고 거래처·배송지로 연결했습니다. 주소와 배송 설정을 확인하세요.");
      } else {
        setSaveMessage(quoteUrl ? "견적 링크와 컨택 기록이 함께 저장되었습니다." : "방문 기록과 후속 일정이 저장되었습니다.");
      }
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : "컨택 기록을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }

  const contactedCount = leads.filter((lead) => isContactedLead(lead.status)).length;
  const quoteCount = leads.filter((lead) => ["견적 요청", "견적 발송"].includes(lead.status)).length;
  const reminderCount = leads.filter((lead) => lead.status === "재연락 예정").length;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <MobileThemeShell>
        <section className="mobile-app-frame mx-auto flex min-h-screen w-full max-w-[480px] flex-col shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
          <header className="mobile-card sticky top-0 z-20 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold">MAJU 모바일 영업</p><p className="mobile-muted truncate text-xs font-semibold">{actorName} · {companyName}</p></div>
              <Link className="mobile-secondary-action inline-flex min-h-10 items-center rounded-lg border px-3 text-xs font-semibold" href="/mobile/today">배송 화면</Link>
            </div>
          </header>

          <div className="flex-1 space-y-3 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3">
            <section className="mobile-card rounded-xl border p-3" aria-label="영업 KPI 현황">
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">이번 달 영업 KPI</p><p className="mobile-muted mt-0.5 text-xs">회사 설정 목표 대비 내 영업 실적</p></div><Target className="h-5 w-5 text-teal-700" /></div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Kpi value={salesKpi?.actualContacts ?? contactedCount} target={salesKpi?.targetContacts} label="컨택" />{holdModulesEnabled ? <Kpi value={salesKpi?.actualQuotes ?? quoteCount} target={salesKpi?.targetQuotes} label="견적" /> : null}<Kpi value={salesKpi?.actualConversions || 0} target={salesKpi?.targetConversions} label="전환" /><Kpi value={reminderCount} label="리마인드" />
              </div>
            </section>

            <section className="mobile-card overflow-hidden rounded-xl border" id="lead-map">
              <div className="flex items-center justify-between border-b border-[var(--mobile-border)] px-3 py-2.5"><div><p className="text-sm font-semibold">내 주변 영업 지도</p><p className="mobile-muted text-xs">보라색 신규 · 청록색 영업 리드</p></div><button className="mobile-secondary-action inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs font-semibold" onClick={requestLocation} type="button"><Crosshair className="h-4 w-4" />내 위치</button></div>
              <KakaoAddressMap focusedMarkerId={selected?.id} mapClassName="h-[260px] w-full" markers={markers} onMarkerClick={(marker) => { const lead = leads.find((item) => item.id === marker.id); if (lead) void openLead(lead); }} showList={false} />
              {locationMessage ? <p className="mobile-muted px-3 py-2 text-xs font-semibold">{locationMessage}</p> : null}
            </section>

            <section className="mobile-card rounded-xl border p-3" id="lead-list">
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="리드 검색" className="mobile-input min-h-10 w-full rounded-lg border py-2 pl-9 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="매장명·주소·업종 검색" value={query} /></div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className={`min-h-10 rounded-lg text-xs font-semibold ${sort === "sales" ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={() => setSort("sales")} type="button">세일즈 추천</button>
                <button className={`min-h-10 rounded-lg text-xs font-semibold ${sort === "near" ? "mobile-primary-action" : "mobile-secondary-action border"}`} onClick={requestLocation} type="button">가까운 순</button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {([['all','전체'],['new','신규'],['sales','영업'],['contacted','컨택 이력'],['reminder','리마인드']] as const).map(([value,label]) => <button className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${view === value ? "mobile-accent-soft" : "border border-[var(--mobile-border)]"}`} key={value} onClick={() => setView(value)} type="button">{label}</button>)}
              </div>

              {loadState === "loading" ? <StateMessage icon={Loader2} text="영업 후보를 불러오는 중입니다." spin /> : null}
              {loadState === "error" ? <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700"><p>{error}</p><button className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg bg-white px-3" onClick={() => void loadLeads()} type="button"><RefreshCw className="h-4 w-4" />다시 시도</button></div> : null}
              {loadState === "ready" ? <div className="mt-3 space-y-2">{visibleLeads.slice(0, 50).map((lead) => <LeadCard key={lead.id} lead={lead} location={location} onOpen={() => void openLead(lead)} />)}{visibleLeads.length === 0 ? <StateMessage icon={MapPin} text="조건에 맞는 리드가 없습니다." /> : null}</div> : null}
            </section>

            <section className="mobile-card rounded-xl border p-3" id="reminders">
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">후속 영업 리마인드</p><p className="mobile-muted text-xs">과거 컨택 후 다시 연락할 매장</p></div><Bell className="h-5 w-5 text-amber-600" /></div>
              <div className="mt-3 space-y-2">{leads.filter((lead) => lead.status === "재연락 예정").slice(0, 10).map((lead) => <button className="mobile-card-raised flex min-h-14 w-full items-center justify-between rounded-lg border px-3 text-left" key={lead.id} onClick={() => void openLead(lead)} type="button"><span><span className="block text-sm font-semibold">{lead.businessName}</span><span className="mobile-muted mt-0.5 block text-xs">{lead.address || "주소 확인 필요"}</span></span><ChevronRight className="h-4 w-4" /></button>)}{reminderCount === 0 ? <p className="mobile-muted rounded-lg border border-dashed border-[var(--mobile-border)] p-3 text-center text-xs font-semibold">등록된 리마인드가 없습니다.</p> : null}</div>
            </section>
          </div>

          <MobileSalesBottomNavigation />
        </section>

        {selected ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${selected.businessName} 컨택 기록`}><div className="mobile-card max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border p-4 sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getMobileLeadType(selected) === "new" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"}`}>{getMobileLeadType(selected) === "new" ? "신규 리드" : "영업 리드"}</span><h2 className="mt-2 text-xl font-bold">{selected.businessName}</h2><p className="mobile-muted mt-1 text-xs font-semibold">{selected.address || "주소 확인 필요"}</p></div><button className="min-h-10 rounded-lg border border-[var(--mobile-border)] px-3 text-xs font-semibold" onClick={() => setSelected(null)} type="button">닫기</button></div>
          <div className="mt-3 grid grid-cols-2 gap-2">{selected.phone ? <a className="mobile-primary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold" href={`tel:${selected.phone}`}><Phone className="h-4 w-4" />전화</a> : <span className="mobile-muted grid min-h-11 place-items-center rounded-lg border text-xs">전화번호 없음</span>}<a className="mobile-secondary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold" href={selected.kakaoPlaceUrl || `https://map.kakao.com/?q=${encodeURIComponent(selected.address || selected.businessName)}`} rel="noreferrer" target="_blank"><MapPin className="h-4 w-4" />지도</a></div>
          {isLeadBusinessHoursDraftEnabled() ? <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-950">영업시간·브레이크타임 빠른 입력</p><input className="mobile-input mt-2 min-h-11 w-full rounded-lg border px-3 text-sm" onChange={(event) => setBusinessHoursDraft(event.target.value)} placeholder="예: 매일 15:00~17:00 브레이크 · 월 휴무" value={businessHoursDraft} /><button className="mt-2 min-h-10 w-full rounded-lg border bg-white text-xs font-semibold text-amber-800" disabled type="button">저장 구조 승인 후 저장 가능</button></section> : null}
          <div className="mt-4"><label className="text-xs font-semibold" htmlFor="contact-result">방문 결과</label><select className="mobile-input mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" id="contact-result" onChange={(event) => { const value = event.target.value as StandardVisitResult; setResult(value); if (needsVisitFollowUp(value) && !reminderDate) setReminderDate(getDefaultVisitFollowUpDate()); }} value={result}>{STANDARD_VISIT_RESULTS.map((option) => <option key={option}>{option}</option>)}</select></div>
          <fieldset className="mt-4"><legend className="text-xs font-semibold">전달 자료</legend><div className="mt-2 grid grid-cols-2 gap-2">{collateralOptions.filter((item) => holdModulesEnabled || item !== "견적서").map((item) => <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border text-xs font-semibold ${collateral.includes(item) ? "mobile-accent-soft" : "border-[var(--mobile-border)]"}`} key={item}><input className="sr-only" type="checkbox" checked={collateral.includes(item)} onChange={() => setCollateral((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item === "브로슈어" || item === "단가표" ? <MessageCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{item}</label>)}</div></fieldset>
          <div className="mt-4"><label className="text-xs font-semibold" htmlFor="contact-memo">컨택 메모 <span className="text-rose-600">필수</span></label><textarea className="mobile-input mt-1 min-h-24 w-full rounded-lg border p-3 text-sm" id="contact-memo" onChange={(event) => setMemo(event.target.value)} placeholder="반응, 필요한 품목, 다음 행동을 기록하세요." value={memo} /></div>
          {holdModulesEnabled ? <button className="mobile-secondary-action mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold" onClick={() => { setQuoteOpen((current) => !current); setCollateral((current) => current.includes("견적서") ? current : [...current, "견적서"]); }} type="button"><FileText className="h-4 w-4" />{quoteOpen ? "견적 작성 닫기" : "품목 선택·견적 작성"}</button> : null}
          {holdModulesEnabled && quoteOpen ? <MobileQuoteBuilder contactMemo={memo} leadId={selected.id} onIssued={({ publicUrl }) => { setIssuedQuoteUrl(publicUrl); setCollateral((current) => current.includes("견적서") ? current : [...current, "견적서"]); setSaveMessage("견적 링크가 생성되었습니다. 방문 결과를 선택해 기록하세요."); }} recipientName={selected.businessName} recipientPhone={selected.phone} /> : null}
          {needsVisitFollowUp(result) ? <div className="mt-4"><label className="text-xs font-semibold" htmlFor="reminder-date">후속 일정 <span className="text-rose-600">필수</span></label><input className="mobile-input mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" id="reminder-date" min={new Date().toISOString().slice(0,10)} onChange={(event) => setReminderDate(event.target.value)} type="date" value={reminderDate} /></div> : null}
          {saveMessage ? <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${/실패|입력해|필수/.test(saveMessage) ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{saveMessage}</p> : null}
          {convertedCustomerId ? <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-900"><p>배송지 · {selected.address || "주소 확인 필요"}</p><p className="mt-1">권역·오늘 코스는 지도에서 바로 확인하고 수정할 수 있습니다.</p><Link className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-white" href={`/dashboard?view=customers&customerId=${encodeURIComponent(convertedCustomerId)}`}>지도에서 배송 설정</Link></div> : null}
          <button className="mobile-primary-action mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:opacity-60" disabled={saving} onClick={() => void saveContact()} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{saving ? "저장 중" : "컨택 기록 저장"}</button>
          <div className="mt-5 border-t border-[var(--mobile-border)] pt-4"><p className="text-sm font-semibold">과거 컨택 전체 흐름</p>{historyLoading ? <StateMessage icon={Loader2} text="이력을 불러오는 중입니다." spin /> : <div className="mt-2 space-y-2">{history.map((item) => <div className="mobile-card-raised rounded-lg border p-3" key={item.id}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{getVisitResultDisplayLabel(item.result || item.actionType)}</span><span className="mobile-muted text-[11px]">{item.createdAt}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5">{item.memo || "메모 없음"}</p>{extractReminderDate(item.memo) ? <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><CalendarClock className="h-3.5 w-3.5" />{extractReminderDate(item.memo)} 재연락</p> : null}<p className="mobile-muted mt-1 text-[11px]">{item.actorName || "담당자 미확인"}</p></div>)}{history.length === 0 ? <p className="mobile-muted py-4 text-center text-xs">아직 저장된 컨택 이력이 없습니다.</p> : null}</div>}</div>
        </div></div> : null}
      </MobileThemeShell>
    </main>
  );
}

function Kpi({ label, target, value }: { label: string; target?: number; value: number }) { return <div className="mobile-card-raised rounded-lg border px-2 py-3"><p className="text-xl font-bold text-teal-700">{value}{target ? <span className="text-[10px] text-slate-400">/{target}</span> : null}</p><p className="mobile-muted mt-1 text-[11px] font-semibold">{label}</p>{target ? <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, Math.round((value / target) * 100))}%` }} /></span> : null}</div>; }

function StateMessage({ icon: Icon, spin = false, text }: { icon: typeof MapPin; spin?: boolean; text: string }) { return <div className="mobile-muted mt-3 flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--mobile-border)] text-xs font-semibold"><Icon className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} />{text}</div>; }

function LeadCard({ lead, location, onOpen }: { lead: PermitLeadItem; location: LocationPoint | null; onOpen: () => void }) {
  const type = getMobileLeadType(lead);
  const leadDistance = distanceKm(location, lead);
  const reasons = lead.nextActionReasons.slice(0, 2);
  return (
    <button className="mobile-card-raised w-full rounded-lg border p-3 text-left" onClick={onOpen} type="button">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${type === "new" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"}`}>{type === "new" ? "신규" : "영업"}</span>
            <span className="mobile-muted text-[11px]">{lead.status}</span>
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold">{lead.businessName}</p>
          <p className="mobile-muted mt-1 truncate text-xs">{lead.address || lead.jurisdiction || "주소 확인 필요"}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{lead.scoreTotal}점</span>
          {leadDistance != null ? <span className="mobile-muted mt-1 block text-[10px] font-semibold">{leadDistance.toFixed(1)}km</span> : null}
        </div>
      </div>
      {reasons.length ? <p className="mt-2 line-clamp-2 rounded-md bg-teal-50 px-2 py-1.5 text-[11px] font-semibold leading-4 text-teal-800">추천 이유 · {reasons.join(" · ")}</p> : null}
      <div className="mobile-muted mt-2 flex items-center justify-between text-[11px]">
        <span>{lead.industryPrimary} · {lead.grade || "미채점"}</span>
        <span className="inline-flex items-center gap-1 text-teal-700">영업 기록 <ChevronRight className="h-3.5 w-3.5" /></span>
      </div>
    </button>
  );
}
