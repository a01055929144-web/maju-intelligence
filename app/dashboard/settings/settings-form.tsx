"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Bell, Building2, FileText, Loader2, MapPin, Route, Save, SendHorizonal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { MessageTemplateManager } from "@/components/message-template-manager";
import { CompanySettings } from "@/lib/store";

type SettingsSection = "company" | "messaging" | "quotes" | "telegram";
type SectionSaveState = { status: "idle" | "saving" | "saved" | "error"; message: string };
type AddressSearchResult = {
  address: string;
  buildingName?: string;
  jibunAddress?: string;
  latitude: number;
  longitude: number;
  postalCode?: string;
  roadAddress?: string;
};

const SECTION_LABELS: Record<SettingsSection, string> = {
  company: "회사 기준정보",
  messaging: "문자 발송 설정",
  quotes: "견적 기본 설정",
  telegram: "텔레그램 알림 설정"
};

export function CompanySettingsForm({ initial }: { initial: CompanySettings }) {
  const [form, setForm] = useState({
    businessType: initial.businessType,
    deliveryCompleteMessage: initial.deliveryCompleteMessage || "요청하신 위치에 배송 적재 완료했습니다.",
    deliveryIssueMessage: initial.deliveryIssueMessage || "배송 중 확인이 필요한 사항이 있어 안내드립니다.",
    deliveryPartialMessage: initial.deliveryPartialMessage || "일부 품목은 확인 후 별도 안내드리겠습니다.",
    defaultQuoteMarginPercent: initial.defaultQuoteMarginPercent || 12,
    defaultQuoteValidDays: initial.defaultQuoteValidDays || 14,
    name: initial.name,
    notificationPhone: initial.notificationPhone || "",
    notificationSenderName: initial.notificationSenderName || initial.name,
    originAddress: initial.originAddress,
    originLat: initial.originLat,
    originLng: initial.originLng,
    ownerName: initial.ownerName,
    smsSenderPhone: initial.smsSenderPhone || "",
    telegramChatId: initial.telegramChatId || ""
  });
  const [savedForm, setSavedForm] = useState(form);
  const [saveStates, setSaveStates] = useState<Record<SettingsSection, SectionSaveState>>({
    company: { status: "idle", message: "" },
    messaging: { status: "idle", message: "" },
    quotes: { status: "idle", message: "" },
    telegram: { status: "idle", message: "" }
  });
  const [telegramTestMessage, setTelegramTestMessage] = useState("");
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [addressSearchMessage, setAddressSearchMessage] = useState("");
  const [addressSearching, setAddressSearching] = useState(false);
  const hasOrigin = Boolean(form.originAddress.trim());
  const hasOriginCoordinates = Number.isFinite(form.originLat) && Number.isFinite(form.originLng);
  const originSelectionRequired = hasOrigin && !hasOriginCoordinates;
  const hasCompanyName = Boolean(form.name.trim());
  const completedItems = [hasCompanyName, hasOrigin && hasOriginCoordinates].filter(Boolean).length;
  const sectionDirty: Record<SettingsSection, boolean> = {
    company: form.businessType !== savedForm.businessType || form.name !== savedForm.name || form.originAddress !== savedForm.originAddress || form.originLat !== savedForm.originLat || form.originLng !== savedForm.originLng || form.ownerName !== savedForm.ownerName,
    messaging:
      form.deliveryCompleteMessage !== savedForm.deliveryCompleteMessage ||
      form.deliveryIssueMessage !== savedForm.deliveryIssueMessage ||
      form.deliveryPartialMessage !== savedForm.deliveryPartialMessage ||
      form.notificationPhone !== savedForm.notificationPhone ||
      form.notificationSenderName !== savedForm.notificationSenderName ||
      form.smsSenderPhone !== savedForm.smsSenderPhone,
    quotes: form.defaultQuoteMarginPercent !== savedForm.defaultQuoteMarginPercent || form.defaultQuoteValidDays !== savedForm.defaultQuoteValidDays,
    telegram: form.telegramChatId !== savedForm.telegramChatId
  };

  function updateSection(section: SettingsSection, patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setSaveStates((current) => ({ ...current, [section]: { status: "idle", message: "변경사항이 아직 저장되지 않았습니다." } }));
  }

  async function saveSection(section: SettingsSection) {
    if (!form.name.trim()) {
      setSaveStates((current) => ({ ...current, [section]: { status: "error", message: "회사명을 입력해주세요." } }));
      return;
    }
    if (section === "company" && originSelectionRequired) {
      setSaveStates((current) => ({ ...current, company: { status: "error", message: "주소 검색 결과에서 정확한 출발지를 선택해주세요." } }));
      return;
    }
    setSaveStates((current) => ({ ...current, [section]: { status: "saving", message: "저장 중입니다." } }));

    // API 계약은 전체 회사 설정 payload를 유지하되, 다른 카드에서 아직 저장하지 않은 입력값까지
    // 함께 반영되지 않도록 마지막 저장본에 현재 카드 필드만 합칩니다.
    const payloadForm = section === "company"
      ? { ...savedForm, businessType: form.businessType, name: form.name, originAddress: form.originAddress, originLat: form.originLat, originLng: form.originLng, ownerName: form.ownerName }
      : section === "messaging"
        ? {
            ...savedForm,
            deliveryCompleteMessage: form.deliveryCompleteMessage,
            deliveryIssueMessage: form.deliveryIssueMessage,
            deliveryPartialMessage: form.deliveryPartialMessage,
            notificationPhone: form.notificationPhone,
            notificationSenderName: form.notificationSenderName,
            smsSenderPhone: form.smsSenderPhone
          }
        : section === "quotes"
          ? { ...savedForm, defaultQuoteMarginPercent: form.defaultQuoteMarginPercent, defaultQuoteValidDays: form.defaultQuoteValidDays }
          : { ...savedForm, telegramChatId: form.telegramChatId };

    let response: Response | null = null;
    let requestError = "";
    try {
      response = await fetchWithTimeout(
        "/api/customer/settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payloadForm, section })
        },
        12000
      );
    } catch (error) {
      requestError = error instanceof Error ? error.message : "네트워크 연결을 확인한 뒤 다시 시도해주세요.";
    }
    const payload = await response?.json().catch(() => null);

    const ok = Boolean(response?.ok);
    if (ok) {
      setSavedForm((current) => section === "company"
        ? { ...current, businessType: payloadForm.businessType, name: payloadForm.name, originAddress: payloadForm.originAddress, originLat: payloadForm.originLat, originLng: payloadForm.originLng, ownerName: payloadForm.ownerName }
        : section === "messaging"
          ? { ...current, deliveryCompleteMessage: payloadForm.deliveryCompleteMessage, deliveryIssueMessage: payloadForm.deliveryIssueMessage, deliveryPartialMessage: payloadForm.deliveryPartialMessage, notificationPhone: payloadForm.notificationPhone, notificationSenderName: payloadForm.notificationSenderName, smsSenderPhone: payloadForm.smsSenderPhone }
          : section === "quotes"
            ? { ...current, defaultQuoteMarginPercent: payloadForm.defaultQuoteMarginPercent, defaultQuoteValidDays: payloadForm.defaultQuoteValidDays }
            : { ...current, telegramChatId: payloadForm.telegramChatId });
    }
    setSaveStates((current) => ({
      ...current,
      [section]: {
        status: ok ? "saved" : "error",
        message: ok ? `${SECTION_LABELS[section]} 저장이 완료됐습니다.` : payload?.error || requestError || "저장에 실패했습니다. 값을 다시 확인해주세요."
      }
    }));
  }

  async function handleTelegramTest() {
    if (sectionDirty.telegram) {
      setTelegramTestMessage("변경한 chat_id를 먼저 저장한 뒤 테스트해주세요.");
      return;
    }
    setTelegramTesting(true);
    setTelegramTestMessage("");

    const response = await fetchWithTimeout("/api/customer/telegram-test", { method: "POST" }, 12000).catch(() => null);
    const payload = await response?.json().catch(() => null);

    setTelegramTesting(false);
    setTelegramTestMessage(response?.ok ? "테스트 메시지를 보냈습니다. 텔레그램 그룹을 확인하세요." : payload?.message || "테스트 발송에 실패했습니다.");
  }

  async function searchOriginAddress() {
    const query = form.originAddress.trim();
    if (query.length < 2) {
      setAddressResults([]);
      setAddressSearchMessage("주소를 2글자 이상 입력하세요.");
      return;
    }

    setAddressSearching(true);
    setAddressSearchMessage("카카오 주소를 검색 중입니다.");
    const response = await fetchWithTimeout(`/api/address-search?query=${encodeURIComponent(query)}`, { cache: "no-store" }, 12000).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setAddressSearching(false);

    if (!response?.ok) {
      setAddressResults([]);
      setAddressSearchMessage(payload?.message || "주소 검색에 실패했습니다.");
      return;
    }

    const results = Array.isArray(payload?.results) ? payload.results as AddressSearchResult[] : [];
    setAddressResults(results);
    setAddressSearchMessage(results.length ? "검색 결과에서 정확한 주소를 선택하세요." : "검색 결과가 없습니다. 도로명이나 지번을 다시 확인하세요.");
  }

  return (
    <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" onSubmit={(event) => event.preventDefault()}>
      <div className="space-y-5">
        {/* 2026-09-08 개선: 예전엔 이 카드 하나("회사 설정" 헤더)에 회사 정보 + 문자 발송 설정 +
            텔레그램 이탈 알림까지 서로 다른 세 기능이 한 카드 안에 섞여 있어서, 카드 헤더가 말하는
            내용과 실제 카드 본문 내용이 어긋나 보였습니다. 셋을 각자 헤더가 맞는 별도 카드로 나눕니다. */}
        <section className="maju-section-card">
          <div className="maju-card-header">
            <Badge className="mb-3 w-fit bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">
              <Building2 className="mr-1 h-3.5 w-3.5" />
              회사 설정
            </Badge>
            <h2 className="text-2xl font-black text-slate-950">회사 기준정보</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">지도와 배송코스에 사용할 회사명과 출발지를 관리합니다.</p>
          </div>
          <div className="space-y-4 p-4">
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">회사명</span>
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                value={form.name}
                onChange={(event) => updateSection("company", { name: event.target.value })}
                required
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground">현장 표시명 <span className="font-semibold text-slate-400">(선택)</span></span>
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  value={form.ownerName}
                  onChange={(event) => updateSection("company", { ownerName: event.target.value })}
                  placeholder="배송 업무를 직접 할 때만 입력"
                />
                <span className="block text-[11px] font-semibold text-slate-400">대표자가 직접 배송·현장 업무를 할 때만 라이브 차량과 기사 화면에 사용됩니다.</span>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground">업태/업종</span>
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  value={form.businessType}
                  onChange={(event) => updateSection("company", { businessType: event.target.value })}
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">물류 출발지 주소</span>
              <div className="flex gap-2">
                <input
                  className="h-11 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  value={form.originAddress}
                  onChange={(event) => {
                    updateSection("company", { originAddress: event.target.value, originLat: undefined, originLng: undefined });
                    setAddressResults([]);
                    setAddressSearchMessage("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchOriginAddress();
                    }
                  }}
                />
                <Button disabled={addressSearching} onClick={() => void searchOriginAddress()} type="button" variant="outline">
                  {addressSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {addressSearching ? "검색 중" : "주소 검색"}
                </Button>
              </div>
              {addressSearchMessage ? <p aria-live="polite" className="text-xs font-semibold text-slate-500">{addressSearchMessage}</p> : null}
              {addressResults.length ? (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {addressResults.map((result, index) => (
                    <button
                      className="block w-full px-3 py-2.5 text-left transition hover:bg-teal-50"
                      key={`${result.address}-${index}`}
                      onClick={() => {
                        updateSection("company", { originAddress: result.address, originLat: result.latitude, originLng: result.longitude });
                        setAddressResults([]);
                        setAddressSearchMessage("카카오 주소와 지도 좌표를 선택했습니다. 저장 버튼을 눌러주세요.");
                      }}
                      type="button"
                    >
                      <span className="block text-sm font-bold text-slate-900">{result.address}</span>
                      {result.jibunAddress && result.jibunAddress !== result.address ? <span className="mt-0.5 block text-xs font-semibold text-slate-500">지번 {result.jibunAddress}</span> : null}
                      {result.buildingName || result.postalCode ? <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">{[result.buildingName, result.postalCode && `우편번호 ${result.postalCode}`].filter(Boolean).join(" · ")}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <SectionSaveFooter
            disabled={saveStates.company.status === "saving" || !sectionDirty.company || originSelectionRequired}
            dirty={sectionDirty.company}
            label="회사 기준정보 저장"
            onSave={() => void saveSection("company")}
            state={saveStates.company}
          />
        </section>

        <section className="maju-section-card">
          <div className="maju-card-header">
            <Badge className="mb-3 w-fit bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-100">
              <FileText className="mr-1 h-3.5 w-3.5" />
              견적 정책
            </Badge>
            <h2 className="text-xl font-black text-slate-950">견적 기본 마진율과 유효기간</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">PC와 모바일에서 새 견적을 만들 때 회사 기본값으로 적용됩니다. 담당자는 견적별로 다시 편집할 수 있습니다.</p>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-muted-foreground">기본 마진율</legend>
              <div className="grid grid-cols-3 gap-2">
                {[10, 12, 15].map((value) => <button className={`min-h-11 rounded-lg border text-sm font-black ${form.defaultQuoteMarginPercent === value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`} key={value} onClick={() => updateSection("quotes", { defaultQuoteMarginPercent: value })} type="button">{value}%</button>)}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-muted-foreground">기본 견적 유효기간</legend>
              <div className="grid grid-cols-3 gap-2">
                {[7, 14, 30].map((value) => <button className={`min-h-11 rounded-lg border text-sm font-black ${form.defaultQuoteValidDays === value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`} key={value} onClick={() => updateSection("quotes", { defaultQuoteValidDays: value })} type="button">{value}일</button>)}
              </div>
            </fieldset>
          </div>
          <SectionSaveFooter
            disabled={saveStates.quotes.status === "saving" || !sectionDirty.quotes}
            dirty={sectionDirty.quotes}
            label="견적 정책 저장"
            onSave={() => void saveSection("quotes")}
            state={saveStates.quotes}
          />
        </section>

        <section className="maju-section-card">
          <div className="maju-card-header">
            <Badge className="mb-3 w-fit bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-100">
              <SendHorizonal className="mr-1 h-3.5 w-3.5" />
              문자 발송 설정
            </Badge>
            <h2 className="text-xl font-black text-slate-950">문자 발신 정보와 기본 문구</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">현장 직원이 배송 메모를 남기지 않아도 여기 저장된 문구로 자동 발송됩니다.</p>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground">문자 문의번호</span>
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  inputMode="tel"
                  onChange={(event) => updateSection("messaging", { notificationPhone: event.target.value })}
                  placeholder="예: 010-0000-0000"
                  value={form.notificationPhone}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground">문자 표시명</span>
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => updateSection("messaging", { notificationSenderName: event.target.value })}
                  placeholder={form.name || "회사명"}
                  value={form.notificationSenderName}
                />
              </label>
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">SOLAPI 발신번호 메모</span>
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                inputMode="tel"
                onChange={(event) => updateSection("messaging", { smsSenderPhone: event.target.value })}
                placeholder="실제 발신은 Vercel SOLAPI_SENDER_PHONE 기준"
                value={form.smsSenderPhone}
              />
              <p className="text-xs font-semibold leading-5 text-slate-500">공용 SOLAPI 발신번호와 고객사 문의번호를 분리해 관리합니다. 점주에게 보이는 문의번호는 위 문자 문의번호입니다.</p>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-950">배송 알림 기본 문구</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">현장 직원 메모가 없을 때 상태별로 자동 사용됩니다.</p>
                </div>
                <Badge className="bg-white text-teal-800 ring-1 ring-inset ring-teal-100">고객사 수정 가능</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <MessageTemplateField
                  label="도착완료"
                  onChange={(value) => updateSection("messaging", { deliveryCompleteMessage: value })}
                  value={form.deliveryCompleteMessage}
                />
                <MessageTemplateField
                  label="부분배송"
                  onChange={(value) => updateSection("messaging", { deliveryPartialMessage: value })}
                  value={form.deliveryPartialMessage}
                />
                <MessageTemplateField
                  label="이슈발생"
                  onChange={(value) => updateSection("messaging", { deliveryIssueMessage: value })}
                  value={form.deliveryIssueMessage}
                />
              </div>
            </div>
            <MessageTemplateManager mode="company" />
          </div>
          <SectionSaveFooter
            disabled={saveStates.messaging.status === "saving" || !sectionDirty.messaging}
            dirty={sectionDirty.messaging}
            label="문자 설정 저장"
            onSave={() => void saveSection("messaging")}
            state={saveStates.messaging}
          />
        </section>

        <section className="maju-section-card">
          <div className="maju-card-header">
            <Badge className="mb-3 w-fit bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100">
              <Bell className="mr-1 h-3.5 w-3.5" />
              이탈 위험 알림
            </Badge>
            <h2 className="text-xl font-black text-slate-950">텔레그램 이탈 위험 알림</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">21일 이상 매출 없는 거래처가 있으면 매일 이 텔레그램 그룹으로 알림을 보냅니다.</p>
          </div>
          <div className="space-y-3 p-4">
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">텔레그램 그룹 chat_id</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  value={form.telegramChatId}
                  onChange={(event) => {
                    updateSection("telegram", { telegramChatId: event.target.value });
                    setTelegramTestMessage("");
                  }}
                  placeholder="예: -1001234567890"
                />
                <Button
                  className="w-full shrink-0 sm:w-auto"
                  disabled={!form.telegramChatId.trim() || sectionDirty.telegram || telegramTesting}
                  onClick={handleTelegramTest}
                  type="button"
                  variant="outline"
                >
                  {telegramTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                  {telegramTesting ? "발송 중..." : "테스트 발송"}
                </Button>
              </div>
            </label>
            <details className="group rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold leading-5 text-slate-500">
              <summary className="cursor-pointer list-none px-3 py-2.5 font-bold text-slate-700 marker:content-none">
                텔레그램 연결 방법 보기
                <span aria-hidden="true" className="ml-1 text-slate-400 group-open:hidden">+</span>
                <span aria-hidden="true" className="ml-1 hidden text-slate-400 group-open:inline">−</span>
              </summary>
              <div className="border-t border-slate-200 px-3 pb-3 pt-2">
              <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                <li>알림 받을 텔레그램 그룹을 만들고, MAJU 담당자에게 안내받은 봇을 그 그룹에 초대합니다.</li>
                <li>그룹 chat_id를 확인합니다 — 그룹에 아무 메시지나 보낸 뒤, 브라우저에서 <code className="rounded bg-white px-1 py-0.5">https://api.telegram.org/bot(봇 토큰)/getUpdates</code>에 접속하면 <code className="rounded bg-white px-1 py-0.5">chat.id</code> 값(그룹은 보통 -로 시작하는 숫자)을 확인할 수 있습니다. 봇 토큰은 MAJU 담당자에게 문의하세요.</li>
                <li>위 입력칸에 chat_id를 저장한 뒤 &quot;테스트 발송&quot;으로 실제 도착을 확인합니다.</li>
              </ol>
              <p className="mt-1.5 text-amber-700">그룹에서 봇이 제외되거나 chat_id가 바뀌면 알림이 조용히 끊깁니다 — 주기적으로 테스트 발송으로 확인해주세요.</p>
              </div>
            </details>
            {telegramTestMessage ? (
              <p className={`text-xs font-bold ${telegramTestMessage.includes("실패") || telegramTestMessage.includes("먼저") ? "text-rose-600" : "text-emerald-700"}`}>
                {telegramTestMessage}
              </p>
            ) : null}
          </div>
          <SectionSaveFooter
            disabled={saveStates.telegram.status === "saving" || !sectionDirty.telegram}
            dirty={sectionDirty.telegram}
            label="텔레그램 설정 저장"
            onSave={() => void saveSection("telegram")}
            state={saveStates.telegram}
          />
        </section>
      </div>

      <aside className="h-fit maju-section-card xl:sticky xl:top-4">
        <div className="maju-card-header flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-950">적용 현황</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">지도·배송에 쓰는 핵심 기준</p>
          </div>
          <Badge className={completedItems >= 2 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
            {completedItems}/2 완료
          </Badge>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <CompactStatus icon={<Building2 className="h-4 w-4" />} label="회사명" ok={hasCompanyName} />
            <CompactStatus icon={<MapPin className="h-4 w-4" />} label="출발지" ok={hasOrigin && hasOriginCoordinates} />
          </div>
          <div className="rounded-lg border border-teal-100 bg-teal-50/70 px-3 py-2.5">
            <p className="text-[11px] font-black text-primary">현재 출발지</p>
            <p className="mt-1 break-words text-sm font-black leading-5 text-foreground">{hasOrigin ? form.originAddress : "주소를 입력해주세요"}</p>
            {hasOrigin && !hasOriginCoordinates ? <p className="mt-1 text-[11px] font-bold text-amber-700">카카오 주소 검색으로 지도 좌표를 확인해주세요.</p> : null}
          </div>
          <details className="group rounded-lg border border-slate-200 bg-white">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs font-black text-slate-700 marker:content-none">
              관련 화면 바로가기
              <span aria-hidden="true" className="text-slate-400 group-open:rotate-90">›</span>
            </summary>
            <div className="grid gap-2 border-t border-slate-200 p-2">
              <QuickLink href="/dashboard" label="지도 홈 보기" />
              <QuickLink href="/crm/timeline" label="거래처 히스토리 보기" />
              <QuickLink href="/" label="거래처 관리 · 등록으로 이동" />
            </div>
          </details>
          <p className="px-1 text-[11px] font-semibold text-slate-400">마지막 수정: {initial.updatedAt}</p>
        </div>
      </aside>
    </form>
  );
}

function SectionSaveFooter({ disabled, dirty, label, onSave, state }: { disabled: boolean; dirty: boolean; label: string; onSave: () => void; state: SectionSaveState }) {
  const saving = state.status === "saving";

  return (
    <div className={`flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${state.status === "error" ? "border-rose-200 bg-rose-50/70" : !dirty && !saving ? "border-emerald-100 bg-emerald-50/50" : "border-teal-100 bg-teal-50/60"}`}>
      <div aria-live="polite" className="min-h-5 text-xs font-bold">
        {state.message ? (
          <span className={state.status === "error" ? "text-rose-700" : state.status === "saved" ? "text-emerald-700" : "text-slate-500"}>
            {state.message}
          </span>
        ) : !dirty && !saving ? (
          <span className="text-emerald-700">저장된 최신 상태입니다.</span>
        ) : (
          <span className="text-slate-500">이 카드에 저장하지 않은 변경사항이 있습니다.</span>
        )}
      </div>
      <Button className="h-11 w-full shrink-0 font-black sm:w-auto" disabled={disabled} onClick={onSave} type="button">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "저장 중..." : label}
      </Button>
    </div>
  );
}

function CompactStatus({ icon, label, ok }: { icon: ReactNode; label: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${ok ? "border-emerald-100 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
      <div className={`flex items-center gap-1.5 ${ok ? "text-emerald-700" : "text-amber-700"}`}>
        {icon}
        <span className="text-xs font-black">{label}</span>
      </div>
      <p className="mt-1 text-[11px] font-bold text-slate-500">{ok ? "설정됨" : "확인 필요"}</p>
    </div>
  );
}

function MessageTemplateField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <textarea
        className="min-h-[84px] w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold leading-5 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="inline-flex min-h-9 items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-foreground transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800" href={href}>
      {label}
      <Route className="h-4 w-4 text-primary" />
    </Link>
  );
}
