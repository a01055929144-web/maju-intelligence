"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Building2, FileText, LinkIcon, PackageCheck, Pencil, Phone, Plus, Route, Save, Search, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { sampleCustomers } from "@/lib/sample-data";

type TimelineItem = {
  id: string;
  expectedRevenue: number;
  leadName: string;
  memo: string;
  nextAction: string;
  region: string;
  result: string;
  visitedAt: string;
};

type DbSummary = {
  description: string;
  label: string;
  normalizedCustomers: number | null;
  tone: "ready" | "fallback";
  visitResults: number | null;
};
type CustomerView = {
  id?: string;
  address: string;
  businessNumber: string;
  businessStatus: string;
  customerName: string;
  deliveryKm: number;
  deliveryManager: string;
  email: string;
  grade: "A" | "B" | "C";
  industry: string;
  lastOrderDays: number;
  loadingPosition: string;
  memoCount: number;
  monthlyRevenue: number;
  phone: string;
  region: string;
  representativeName: string;
  visitCount: number;
};
type CustomerNoteView = {
  id: string;
  createdAt: string;
  createdByName: string;
  memo: string;
  nextAction: string;
  noteType: string;
};
type CustomerAttachmentView = {
  id: string;
  attachmentType: string;
  createdAt: string;
  fileUrl: string;
  mimeType: string;
  title: string;
};

const resultLabels: Record<string, string> = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

const defaultDbSummary: DbSummary = {
  description: "DB 상태를 확인 중입니다. 실패해도 화면은 샘플 데이터로 유지됩니다.",
  label: "DB 확인 중",
  normalizedCustomers: null,
  tone: "fallback",
  visitResults: null
};

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

function getSelectedCustomerIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("customerId") || "";
}

function withCompanyQuery(path: string) {
  const companyId = getAdminCompanyIdFromUrl();
  if (!companyId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
}

export default function CrmTimelinePage() {
  const [timeline, setTimeline] = useState<TimelineItem[]>(sampleVisitTimeline);
  const [dbSummary, setDbSummary] = useState<DbSummary>(defaultDbSummary);
  const [dbError, setDbError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<"all" | "A" | "B" | "C">("all");

  useEffect(() => {
    let active = true;

    fetch(withCompanyQuery("/api/customer/history-status"), { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (payload?.timeline?.length) setTimeline(payload.timeline);
        if (payload?.dbSummary) setDbSummary(payload.dbSummary);
        if (payload?.errorMessage) setDbError(payload.errorMessage);
      })
      .catch((error) => {
        if (!active) return;
        setDbError(error instanceof Error ? error.message : "DB 상태 API 호출 실패");
        setDbSummary({
          description: "DB 상태 API 호출에 실패했습니다. 화면은 샘플 데이터로 유지합니다.",
          label: "DB 확인 실패",
          normalizedCustomers: null,
          tone: "fallback",
          visitResults: null
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const sampleCustomerViews = useMemo(
    () =>
      sampleCustomers.map((customer, index) => ({
        ...customer,
        id: `sample-${index + 1}`,
        businessNumber: `123-${String(10 + index).padStart(2, "0")}-${String(10000 + index).padStart(5, "0")}`,
        businessStatus: index % 7 === 0 ? "확인 필요" : "정상",
        deliveryManager: ["김배송 매니저", "박배송 매니저", "이배송 매니저", "최배송 매니저"][index % 4],
        grade: revenueGrade(customer.monthlyRevenue) as "A" | "B" | "C",
        memoCount: 2 + (index % 4),
        phone: `010-${String(3100 + index).padStart(4, "0")}-${String(1000 + index).padStart(4, "0")}`,
        email: `${customer.customerName.replace(/\s/g, "").toLowerCase()}@example.com`,
        loadingPosition: index % 3 === 0 ? "후문 냉장창고 앞" : index % 3 === 1 ? "1층 주방 입구" : "건물 우측 적재 구역",
        representativeName: index % 2 === 0 ? "김민준" : "이서연"
      })),
    []
  );
  const [customers, setCustomers] = useState<CustomerView[]>(sampleCustomerViews);

  useEffect(() => {
    let active = true;

    fetch(withCompanyQuery("/api/customers"), { cache: "no-store" })
      .then((response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (!active || !payload?.customers?.length) return;
        setCustomers(payload.customers);
        const requestedCustomerId = getSelectedCustomerIdFromUrl();
        const requestedIndex = requestedCustomerId ? payload.customers.findIndex((customer: CustomerView) => customer.id === requestedCustomerId) : -1;
        setSelectedIndex(requestedIndex >= 0 ? requestedIndex : 0);
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, []);

  const selectedCustomer = customers[selectedIndex] || customers[0];
  const [draftCustomer, setDraftCustomer] = useState<CustomerView | null>(null);
  const [customerAttachments, setCustomerAttachments] = useState<CustomerAttachmentView[]>([]);
  const [customerNotes, setCustomerNotes] = useState<CustomerNoteView[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newMemo, setNewMemo] = useState("");
  const [newNextAction, setNewNextAction] = useState("");
  const [newAttachmentTitle, setNewAttachmentTitle] = useState("배송 적재위치 사진/영상");
  const [newAttachmentType, setNewAttachmentType] = useState("loading_position");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [newAttachmentFile, setNewAttachmentFile] = useState<File | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [isAttachmentSaving, setIsAttachmentSaving] = useState(false);

  useEffect(() => {
    setDraftCustomer(selectedCustomer ? { ...selectedCustomer } : null);
    setIsEditing(false);
    setSaveMessage("");
    setNewMemo("");
    setNewNextAction("");
    setNewAttachmentTitle("배송 적재위치 사진/영상");
    setNewAttachmentType("loading_position");
    setNewAttachmentUrl("");
    setNewAttachmentFile(null);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedCustomer?.id) return;
    let active = true;

    fetch(withCompanyQuery(`/api/customer-operations?customerId=${encodeURIComponent(selectedCustomer.id)}`), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        setCustomerAttachments(payload.attachments || []);
        setCustomerNotes(payload.notes || []);
      })
      .catch(() => {
        if (!active) return;
        setCustomerAttachments([]);
        setCustomerNotes([]);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomer?.id]);

  const quoteRequests = timeline.filter((item) => item.result === "quote-requested").length;
  const expectedRevenue = timeline.reduce((total, item) => total + item.expectedRevenue, 0);
  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();

    return customers
      .map((customer, index) => ({ customer, index }))
      .filter(({ customer }) => {
        const matchesGrade = gradeFilter === "all" || customer.grade === gradeFilter;
        const matchesKeyword =
          !keyword ||
          [
            customer.customerName,
            customer.address,
            customer.businessNumber,
            customer.deliveryManager,
            customer.industry,
            customer.phone,
            customer.region
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword));

        return matchesGrade && matchesKeyword;
      });
  }, [customerSearch, customers, gradeFilter]);
  const loadingPositionAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "loading_position").length;

  function updateDraft(field: keyof CustomerView, value: string) {
    setDraftCustomer((current) => {
      if (!current) return current;
      if (field === "deliveryKm" || field === "lastOrderDays" || field === "monthlyRevenue" || field === "visitCount") {
        return { ...current, [field]: Number(value.replace(/[^0-9.]/g, "")) || 0 };
      }
      return { ...current, [field]: value };
    });
  }

  async function saveCustomer() {
    if (!draftCustomer) return;
    setIsSaving(true);
    setSaveMessage("");

    try {
      const response = await fetch(withCompanyQuery("/api/customers"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: draftCustomer.address,
          businessNumber: draftCustomer.businessNumber,
          businessStatus: draftCustomer.businessStatus,
          customerName: draftCustomer.customerName,
          deliveryKm: draftCustomer.deliveryKm,
          deliveryManager: draftCustomer.deliveryManager,
          email: draftCustomer.email,
          industry: draftCustomer.industry,
          lastOrderDays: draftCustomer.lastOrderDays,
          loadingPosition: draftCustomer.loadingPosition,
          monthlyRevenue: draftCustomer.monthlyRevenue,
          phone: draftCustomer.phone,
          region: draftCustomer.region,
          representativeName: draftCustomer.representativeName,
          visitCount: draftCustomer.visitCount,
          companyId: getAdminCompanyIdFromUrl()
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "거래처 저장에 실패했습니다.");

      const saved = payload?.customer ? { ...draftCustomer, ...payload.customer } : draftCustomer;
      setCustomers((current) => current.map((customer, index) => (index === selectedIndex ? saved : customer)));
      setDraftCustomer(saved);
      setIsEditing(false);
      setSaveMessage(payload?.persisted === false ? "현재 Vercel DB 환경변수가 없어 화면에만 반영되었습니다." : "거래처 정보가 저장되었습니다.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveNote() {
    if (!selectedCustomer?.id || !newMemo.trim()) return;
    setIsNoteSaving(true);

    try {
      const response = await fetch("/api/customer-operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "note",
          customerId: selectedCustomer.id,
          companyId: getAdminCompanyIdFromUrl(),
          memo: newMemo,
          nextAction: newNextAction,
          noteType: "general"
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "메모 저장에 실패했습니다.");
      if (payload?.note) setCustomerNotes((current) => [payload.note, ...current]);
      setNewMemo("");
      setNewNextAction("");
    } finally {
      setIsNoteSaving(false);
    }
  }

  async function saveAttachment() {
    if (!selectedCustomer?.id || !newAttachmentTitle.trim()) return;
    setIsAttachmentSaving(true);

    try {
      let response: Response;

      if (newAttachmentFile) {
        const formData = new FormData();
        formData.append("attachmentType", newAttachmentType);
        formData.append("companyId", getAdminCompanyIdFromUrl());
        formData.append("customerId", selectedCustomer.id);
        formData.append("file", newAttachmentFile);
        formData.append("title", newAttachmentTitle);
        response = await fetch("/api/customer-attachments/upload", {
          method: "POST",
          body: formData
        });
      } else {
        response = await fetch("/api/customer-operations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "attachment",
            attachmentType: newAttachmentType,
            companyId: getAdminCompanyIdFromUrl(),
            customerId: selectedCustomer.id,
            fileUrl: newAttachmentUrl,
            mimeType: guessMimeType(newAttachmentUrl),
            title: newAttachmentTitle
          })
        });
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "첨부자료 저장에 실패했습니다.");
      if (payload?.attachment) setCustomerAttachments((current) => [payload.attachment, ...current]);
      setNewAttachmentTitle(attachmentTitleFromType(newAttachmentType));
      setNewAttachmentUrl("");
      setNewAttachmentFile(null);
    } finally {
      setIsAttachmentSaving(false);
    }
  }

  return (
    <CustomerAppShell
      active="customers"
      companyName="관리자 미리보기"
      rightAction={
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
          href="/routes/today"
        >
          영업·배송 코스
        </Link>
      }
      subtitle="매장 기본정보, 사업자 상태, 배송 적재위치, 메모와 방문 기록을 거래처별로 관리합니다."
      title="거래처 히스토리"
      userName="관리자"
    >
      <section className="mx-auto max-w-[1760px] space-y-4">
        <div className="rounded-md border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge className={dbSummary.tone === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{dbSummary.label}</Badge>
              <span className="text-sm font-black text-slate-950">전체 {customers.length}곳</span>
              <span className="text-sm font-black text-emerald-700">A등급 {customers.filter((customer) => customer.grade === "A").length}곳</span>
              <span className="text-sm font-black text-blue-700">현재 목록 {filteredCustomers.length}곳</span>
              <span className="text-sm font-black text-violet-700">예상매출 {expectedRevenue.toLocaleString()}만원</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black text-slate-500">
              <span className="rounded-md bg-slate-100 px-3 py-2">정제 거래처 {formatDbCount(dbSummary.normalizedCustomers)}</span>
              <span className="rounded-md bg-slate-100 px-3 py-2">방문 결과 {formatDbCount(dbSummary.visitResults)}</span>
            </div>
          </div>
          {dbError ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">DB/API 확인 메시지: {dbError}</p> : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-200/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-slate-950">거래처 목록</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">검색, 등급, 담당자 기준으로 빠르게 찾습니다.</p>
                </div>
                <Badge className="bg-slate-100 text-slate-700">{filteredCustomers.length}/{customers.length}곳</Badge>
              </div>
            </div>
            <div className="border-b border-slate-200/80 bg-slate-50/70 p-4">
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="상호명, 주소, 사업자번호 검색"
                  value={customerSearch}
                />
              </label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {(["all", "A", "B", "C"] as const).map((grade) => (
                  <button
                    className={`h-9 rounded-md border text-xs font-black transition ${
                      gradeFilter === grade ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                    key={grade}
                    onClick={() => setGradeFilter(grade)}
                    type="button"
                  >
                    {grade === "all" ? "전체" : `${grade}등급`}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[calc(100vh-390px)] space-y-2 overflow-auto p-3">
              {filteredCustomers.map(({ customer, index }) => (
                <button
                  key={`${customer.customerName}-${customer.address}`}
                  className={`w-full rounded-md border p-4 text-left transition ${
                    index === selectedIndex ? "border-slate-900 bg-slate-50 shadow-sm ring-1 ring-slate-900/5" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() => setSelectedIndex(index)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{customer.customerName}</p>
                      <p className="mt-1 truncate text-xs font-bold text-slate-500">{customer.region} · {customer.address}</p>
                    </div>
                    <Badge className={gradeClassName(customer.grade)}>{customer.grade}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-1">{customer.industry}</span>
                    <span className="rounded bg-slate-100 px-2 py-1">{customer.deliveryKm}km</span>
                    <span className="rounded bg-slate-100 px-2 py-1">{customer.monthlyRevenue}만원</span>
                    <span className="rounded bg-slate-100 px-2 py-1">{customer.deliveryManager}</span>
                  </div>
                </button>
              ))}
              {!filteredCustomers.length ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-black text-slate-700">조건에 맞는 거래처가 없습니다.</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">검색어 또는 등급 필터를 바꿔보세요.</p>
                </div>
              ) : null}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <Badge className="mb-3 bg-slate-100 text-slate-700">선택 거래처</Badge>
                  <h2 className="truncate text-[26px] font-black leading-tight text-slate-950">{selectedCustomer.customerName}</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    {selectedCustomer.deliveryManager} · {selectedCustomer.region} · {selectedCustomer.address}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge className={gradeClassName(selectedCustomer.grade)}>매출 {selectedCustomer.grade}등급</Badge>
                  <Badge className={selectedCustomer.businessStatus === "정상" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>
                    사업자 {selectedCustomer.businessStatus}
                  </Badge>
                  <Link
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                    href="/routes/today"
                  >
                    <Route className="h-3.5 w-3.5" />
                    코스 보기
                  </Link>
                  <button
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => setIsEditing((value) => !value)}
                    type="button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {isEditing ? "보기" : "편집"}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <InfoTile icon={Building2} label="사업자번호" value={selectedCustomer.businessNumber} />
                <InfoTile icon={Phone} label="연락처" value={selectedCustomer.phone} />
                <InfoTile icon={Banknote} label="월 매출" value={`${selectedCustomer.monthlyRevenue.toLocaleString()}만원`} />
                <InfoTile icon={Route} label="배송거리" value={`${selectedCustomer.deliveryKm}km`} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <PriorityTile label="배송 적재위치" value={selectedCustomer.loadingPosition || "미등록"} helper={`${loadingPositionAttachments}개 자료 등록`} tone="blue" />
                <PriorityTile label="히스토리 메모" value={`${customerNotes.length || selectedCustomer.memoCount}건`} helper="상담·배송 특이사항" tone="slate" />
                <PriorityTile label="담당 배송자" value={selectedCustomer.deliveryManager} helper={`${selectedCustomer.region} 권역`} tone="emerald" />
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_440px]">
              <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-950">기본 정보</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">현장에서 바로 수정하고 저장하는 거래처 원장입니다.</p>
                  </div>
                  {isEditing ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={isSaving}
                      onClick={saveCustomer}
                      type="button"
                    >
                      <Save className="h-4 w-4" />
                      {isSaving ? "저장 중" : "변경 저장"}
                    </button>
                  ) : null}
                </div>
                {saveMessage ? (
                  <p className={`mt-3 rounded-md p-3 text-xs font-bold ${saveMessage.includes("실패") || saveMessage.includes("오류") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {saveMessage}
                  </p>
                ) : null}
                {isEditing && draftCustomer ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <EditableField label="상호명" value={draftCustomer.customerName} onChange={(value) => updateDraft("customerName", value)} />
                    <EditableField label="사업자번호" value={draftCustomer.businessNumber} onChange={(value) => updateDraft("businessNumber", value)} />
                    <EditableField label="대표자명" value={draftCustomer.representativeName} onChange={(value) => updateDraft("representativeName", value)} />
                    <EditableField label="연락처" value={draftCustomer.phone} onChange={(value) => updateDraft("phone", value)} />
                    <EditableField label="이메일" value={draftCustomer.email} onChange={(value) => updateDraft("email", value)} />
                    <EditableField label="업종" value={draftCustomer.industry} onChange={(value) => updateDraft("industry", value)} />
                    <EditableField label="지역" value={draftCustomer.region} onChange={(value) => updateDraft("region", value)} />
                    <EditableField label="월 매출(만원)" value={String(draftCustomer.monthlyRevenue)} onChange={(value) => updateDraft("monthlyRevenue", value)} />
                    <EditableField label="배송담당자" value={draftCustomer.deliveryManager} onChange={(value) => updateDraft("deliveryManager", value)} />
                    <EditableField label="배송거리(km)" value={String(draftCustomer.deliveryKm)} onChange={(value) => updateDraft("deliveryKm", value)} />
                    <EditableField label="최근 주문일" value={String(draftCustomer.lastOrderDays)} onChange={(value) => updateDraft("lastOrderDays", value)} />
                    <EditableField label="방문횟수" value={String(draftCustomer.visitCount)} onChange={(value) => updateDraft("visitCount", value)} />
                    <EditableField className="md:col-span-2" label="주소" value={draftCustomer.address} onChange={(value) => updateDraft("address", value)} />
                    <EditableField className="md:col-span-2" label="배송 적재위치" value={draftCustomer.loadingPosition} onChange={(value) => updateDraft("loadingPosition", value)} />
                  </div>
                ) : (
                  <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
                    <DetailRow label="상호명" value={selectedCustomer.customerName} />
                    <DetailRow label="사업자번호" value={selectedCustomer.businessNumber} />
                    <DetailRow label="대표자명" value={selectedCustomer.representativeName} />
                    <DetailRow label="업종" value={selectedCustomer.industry} />
                    <DetailRow label="지역" value={selectedCustomer.region} />
                    <DetailRow label="주소" value={selectedCustomer.address} />
                    <DetailRow label="최근 주문" value={`${selectedCustomer.lastOrderDays}일 전`} />
                    <DetailRow label="담당자" value={selectedCustomer.deliveryManager} />
                  </div>
                )}
              </div>

              <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
                <h3 className="text-base font-black text-slate-950">배송 적재위치</h3>
                <p className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-black leading-6 text-blue-800">{selectedCustomer.loadingPosition}</p>
                <div className="mt-4 rounded-md border border-slate-200/80 bg-slate-50/70 p-3">
                  <div className="grid gap-2">
                    <select
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      onChange={(event) => {
                        setNewAttachmentType(event.target.value);
                        setNewAttachmentTitle(attachmentTitleFromType(event.target.value));
                      }}
                      value={newAttachmentType}
                    >
                      <option value="loading_position">배송 적재위치 사진/영상</option>
                      <option value="business_license">사업자등록증</option>
                      <option value="bank_account">통장사본</option>
                      <option value="etc">기타 첨부자료</option>
                    </select>
                    <input
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      onChange={(event) => setNewAttachmentTitle(event.target.value)}
                      placeholder="자료명"
                      value={newAttachmentTitle}
                    />
                    <input
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      onChange={(event) => setNewAttachmentUrl(event.target.value)}
                      placeholder="파일 링크 또는 외부 URL"
                      value={newAttachmentUrl}
                    />
                    <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white p-3 text-center text-sm font-black text-slate-600 transition hover:border-slate-400 hover:bg-slate-50">
                      <span>{newAttachmentFile ? newAttachmentFile.name : "파일 직접 선택"}</span>
                      <span className="mt-1 text-xs font-bold text-slate-400">이미지/PDF/영상, 최대 50MB</span>
                      <input
                        accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/quicktime"
                        className="hidden"
                        onChange={(event) => setNewAttachmentFile(event.target.files?.[0] || null)}
                        type="file"
                      />
                    </label>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!newAttachmentTitle.trim() || (!newAttachmentUrl.trim() && !newAttachmentFile) || isAttachmentSaving}
                      onClick={saveAttachment}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      {isAttachmentSaving ? "등록 중" : "첨부자료 등록"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {customerAttachments.length ? (
                    customerAttachments.map((attachment) => (
                      <AttachmentRow
                        key={attachment.id}
                        icon={attachment.attachmentType === "loading_position" ? PackageCheck : FileText}
                        label={attachmentLabel(attachment.attachmentType, attachment.title)}
                        url={attachment.fileUrl}
                        value={attachment.fileUrl ? `등록 완료 · ${attachment.createdAt}` : `파일 연결 대기 · ${attachment.createdAt}`}
                      />
                    ))
                  ) : (
                    <>
                      <AttachmentRow icon={PackageCheck} label="적재위치 사진/영상" value="등록 대기" />
                      <AttachmentRow icon={FileText} label="사업자등록증" value="OCR 검수 대기" />
                      <AttachmentRow icon={FileText} label="통장사본" value="등록 대기" />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_440px]">
              <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-950">메모 히스토리</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">상담, 배송 특이사항, 대표 요청사항을 누적합니다.</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700">{customerNotes.length || selectedCustomer.memoCount}건</Badge>
                </div>
                <div className="mt-4 rounded-md border border-slate-200/80 bg-slate-50/70 p-3">
                  <textarea
                    className="min-h-24 w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-sm font-bold leading-6 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    onChange={(event) => setNewMemo(event.target.value)}
                    placeholder="상담 내용, 배송 특이사항, 대표 요청사항을 기록하세요."
                    value={newMemo}
                  />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      onChange={(event) => setNewNextAction(event.target.value)}
                      placeholder="다음 액션 예: 견적서 발송"
                      value={newNextAction}
                    />
                    <button
                      className="h-10 rounded-md bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!newMemo.trim() || isNoteSaving}
                      onClick={saveNote}
                      type="button"
                    >
                      {isNoteSaving ? "저장 중" : "메모 저장"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {customerNotes.map((note) => (
                    <div key={note.id} className="rounded-md border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Badge className="bg-slate-100 text-slate-700">{noteTypeLabel(note.noteType)}</Badge>
                        <span className="text-xs font-bold text-slate-400">{note.createdAt}</span>
                      </div>
                      <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{note.memo}</p>
                      {note.nextAction ? <p className="mt-2 text-xs font-black text-blue-700">다음 액션: {note.nextAction}</p> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
                <Badge className="mb-3 bg-violet-50 text-violet-700">영업 방문 기록</Badge>
                <h3 className="text-base font-black text-slate-950">최근 액션</h3>
                <div className="mt-4 space-y-3">
                  {timeline.map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-950">{item.leadName}</p>
                        <Badge className="bg-blue-50 text-blue-700">{resultLabels[item.result] || item.result}</Badge>
                      </div>
                      <p className="text-sm font-medium leading-6 text-slate-600">{item.memo || "메모 없음"}</p>
                      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500">
                        <span>다음 액션: {item.nextAction || "미정"}</span>
                        <span>{item.visitedAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </CustomerAppShell>
  );
}

function MiniMetric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-slate-200/80 bg-slate-50/70 p-3 ${wide ? "col-span-2" : ""}`}>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, helper, tone = "slate" }: { helper: string; label: string; tone?: "slate" | "emerald" | "blue" | "violet"; value: string }) {
  const toneClassName = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    slate: "text-slate-950",
    violet: "text-violet-700"
  }[tone];

  return (
    <div className="rounded-md border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-black uppercase text-slate-400">{label}</p>
      <p className={`mt-2 whitespace-nowrap text-[24px] font-black leading-none ${toneClassName}`}>{value}</p>
      <p className="mt-2 truncate text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200/80 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="text-xs font-black text-slate-500">{label}</p>
      </div>
      <p className="mt-2 truncate text-sm font-black text-slate-950" title={value}>
        {value}
      </p>
    </div>
  );
}

function PriorityTile({
  helper,
  label,
  tone,
  value
}: {
  helper: string;
  label: string;
  tone: "blue" | "emerald" | "slate";
  value: string;
}) {
  const toneClassName = {
    blue: "border-blue-100 bg-blue-50/80 text-blue-800",
    emerald: "border-emerald-100 bg-emerald-50/80 text-emerald-800",
    slate: "border-slate-200 bg-slate-50/80 text-slate-800"
  }[tone];

  return (
    <div className={`min-w-0 rounded-md border p-4 ${toneClassName}`}>
      <p className="text-xs font-black opacity-70">{label}</p>
      <p className="mt-2 truncate text-sm font-black" title={value}>
        {value}
      </p>
      <p className="mt-1 text-xs font-bold opacity-60">{helper}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-4 border-b border-slate-100 py-2.5 text-sm last:border-b-0">
      <p className="font-bold text-slate-400">{label}</p>
      <p className="font-black text-slate-800">{value}</p>
    </div>
  );
}

function EditableField({
  className = "",
  label,
  onChange,
  value
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-xs font-black text-slate-500">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function AttachmentRow({ icon: Icon, label, url = "", value }: { icon: typeof PackageCheck; label: string; url?: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
      <Icon className="h-4 w-4 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-slate-800">{label}</p>
        <p className="text-xs font-bold text-slate-500">{value}</p>
      </div>
      {url ? (
        <a
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          열기
        </a>
      ) : null}
    </div>
  );
}

function attachmentLabel(type: string, title: string) {
  if (type === "business_license") return "사업자등록증";
  if (type === "bank_account") return "통장사본";
  if (type === "loading_position") return "배송 적재위치 사진/영상";
  return title || "첨부자료";
}

function noteTypeLabel(type: string) {
  if (type === "delivery") return "배송";
  if (type === "sales") return "상담";
  if (type === "settlement") return "정산";
  return "메모";
}

function attachmentTitleFromType(type: string) {
  if (type === "business_license") return "사업자등록증";
  if (type === "bank_account") return "통장사본";
  if (type === "loading_position") return "배송 적재위치 사진/영상";
  return "기타 첨부자료";
}

function guessMimeType(url: string) {
  const normalized = url.toLowerCase().split("?")[0];
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

function revenueGrade(monthlyRevenue: number) {
  if (monthlyRevenue >= 350) return "A";
  if (monthlyRevenue >= 180) return "B";
  return "C";
}

function gradeClassName(grade: string) {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

function formatDbCount(value: number | null) {
  return value === null ? "확인 필요" : `${value.toLocaleString()}건`;
}

const sampleVisitTimeline: TimelineItem[] = [
  {
    id: "history-001",
    expectedRevenue: 320,
    leadName: "성수 온반",
    memo: "대표가 단가표 재요청. 다음 방문 때 냉동 품목 샘플 제안 예정.",
    nextAction: "단가표 발송",
    region: "성수동",
    result: "quote-requested",
    visitedAt: "2026-07-08"
  },
  {
    id: "history-002",
    expectedRevenue: 210,
    leadName: "성수 국밥집",
    memo: "오전 입고 선호. 배송 적재위치는 후문 냉장창고 앞.",
    nextAction: "배송시간 조율",
    region: "성수동",
    result: "visited",
    visitedAt: "2026-07-07"
  },
  {
    id: "history-003",
    expectedRevenue: 480,
    leadName: "강남 정식",
    memo: "한식 주력 품목 반응 좋음. 월 단위 견적 비교 요청.",
    nextAction: "월 견적서 작성",
    region: "강남구",
    result: "interested",
    visitedAt: "2026-07-06"
  }
];
