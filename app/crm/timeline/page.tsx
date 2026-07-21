"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Building2, CheckCircle2, FileText, LinkIcon, MapPin, PackageCheck, Pencil, Phone, Plus, Route, Save, Search, Store } from "lucide-react";
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
type AddressSearchResult = {
  address: string;
  buildingName: string;
  jibunAddress: string;
  latitude: number;
  longitude: number;
  postalCode: string;
  region: string;
  roadAddress: string;
};

const resultLabels: Record<string, string> = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

const defaultDbSummary: DbSummary = {
  description: "DB 상태를 확인 중입니다. 실패해도 거래처 화면은 기준 데이터로 표시됩니다.",
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
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const [timeline, setTimeline] = useState<TimelineItem[]>(sampleVisitTimeline);
  const [dbSummary, setDbSummary] = useState<DbSummary>(defaultDbSummary);
  const [dbError, setDbError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<"all" | "A" | "B" | "C">("all");
  const [operationFilter, setOperationFilter] = useState<"all" | "business-check" | "loading-missing" | "contact-missing">("all");

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
          description: "DB 상태 API 호출에 실패했습니다. 거래처 화면은 기준 데이터로 표시합니다.",
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
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [addressSearchMessage, setAddressSearchMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isAddressSearching, setIsAddressSearching] = useState(false);
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
    setAddressQuery(selectedCustomer?.address || "");
    setAddressResults([]);
    setAddressSearchMessage("");
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
        const matchesOperation =
          operationFilter === "all" ||
          (operationFilter === "business-check" && customer.businessStatus !== "정상") ||
          (operationFilter === "loading-missing" && !customer.loadingPosition) ||
          (operationFilter === "contact-missing" && (!customer.phone || !customer.representativeName));
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

        return matchesGrade && matchesOperation && matchesKeyword;
      });
  }, [customerSearch, customers, gradeFilter, operationFilter]);
  const businessCheckCount = customers.filter((customer) => customer.businessStatus !== "정상").length;
  const loadingMissingCount = customers.filter((customer) => !customer.loadingPosition).length;
  const contactMissingCount = customers.filter((customer) => !customer.phone || !customer.representativeName).length;
  const needsAttentionCustomers = customers.filter((customer) => customerOperationalIssues(customer).length > 0);
  const readyCustomerCount = customers.length - needsAttentionCustomers.length;
  const loadingPositionAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "loading_position").length;
  const businessCertificateAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "business_license").length;
  const bankAccountAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "bank_account").length;
  const operationalChecks = [
    {
      description: selectedCustomer.businessStatus === "정상" ? "사업자 상태가 정상으로 관리 중입니다." : "사업자 상태 확인 또는 재조회가 필요합니다.",
      ok: selectedCustomer.businessStatus === "정상",
      title: "사업자 상태"
    },
    {
      description: selectedCustomer.phone && selectedCustomer.representativeName ? "대표자와 연락처가 등록되어 있습니다." : "대표자명 또는 연락처를 보완하세요.",
      ok: Boolean(selectedCustomer.phone && selectedCustomer.representativeName),
      title: "연락 기본값"
    },
    {
      description: selectedCustomer.address ? "배송주소가 등록되어 지도와 경로 계산에 사용할 수 있습니다." : "배송주소를 먼저 등록하세요.",
      ok: Boolean(selectedCustomer.address),
      title: "배송주소"
    },
    {
      description: selectedCustomer.loadingPosition ? `${selectedCustomer.loadingPosition} · 자료 ${loadingPositionAttachments}건` : "현장 배송 적재위치를 등록하세요.",
      ok: Boolean(selectedCustomer.loadingPosition && loadingPositionAttachments > 0),
      title: "배송 적재위치"
    },
    {
      description: `사업자등록증 ${businessCertificateAttachments}건 · 통장사본 ${bankAccountAttachments}건`,
      ok: businessCertificateAttachments > 0 && bankAccountAttachments > 0,
      title: "필수 첨부자료"
    },
    {
      description: customerNotes.length ? "최근 메모가 서버 이력으로 관리됩니다." : `${selectedCustomer.memoCount}건 기준 이력이 표시됩니다.`,
      ok: customerNotes.length > 0 || selectedCustomer.memoCount > 0,
      title: "메모 히스토리"
    }
  ];
  const operationalReadyCount = operationalChecks.filter((check) => check.ok).length;
  const urgentOperationalChecks = operationalChecks.filter((check) => !check.ok).slice(0, 3);
  const operationalActionItems = urgentOperationalChecks.length
    ? urgentOperationalChecks
    : operationalChecks.slice(0, 3);
  const draftBusinessNumberChanged = Boolean(
    draftCustomer && normalizeBusinessRegistrationNumber(draftCustomer.businessNumber) !== normalizeBusinessRegistrationNumber(selectedCustomer.businessNumber)
  );
  const draftBusinessNumberValid = !draftCustomer?.businessNumber || isValidBusinessRegistrationNumber(draftCustomer.businessNumber);
  const canSaveCustomer = !isSaving && (!draftBusinessNumberChanged || draftBusinessNumberValid);

  function updateDraft(field: keyof CustomerView, value: string) {
    setDraftCustomer((current) => {
      if (!current) return current;
      if (field === "deliveryKm" || field === "lastOrderDays" || field === "monthlyRevenue" || field === "visitCount") {
        return { ...current, [field]: Number(value.replace(/[^0-9.]/g, "")) || 0 };
      }
      return { ...current, [field]: value };
    });
  }

  async function searchAddress() {
    const query = addressQuery.trim();
    if (query.length < 2) {
      setAddressSearchMessage("주소 검색어를 2글자 이상 입력하세요.");
      return;
    }

    setIsAddressSearching(true);
    setAddressSearchMessage("");
    const response = await fetch(`/api/address-search?query=${encodeURIComponent(query)}`, { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    const results = Array.isArray(payload?.results) ? payload.results : [];

    setAddressResults(results);
    setAddressSearchMessage(results.length ? `${results.length}개 주소를 찾았습니다.` : payload?.message || "검색 결과가 없습니다.");
    setIsAddressSearching(false);
  }

  function selectAddress(result: AddressSearchResult) {
    setDraftCustomer((current) =>
      current
        ? {
            ...current,
            address: result.address,
            region: result.region || extractRegion(result.address) || current.region
          }
        : current
    );
    setAddressQuery(result.address);
    setAddressResults([]);
    setAddressSearchMessage("선택한 주소를 거래처 원장에 반영했습니다.");
  }

  async function saveCustomer() {
    if (!draftCustomer) return;
    if (draftBusinessNumberChanged && !draftBusinessNumberValid) {
      setSaveMessage("사업자번호가 유효하지 않습니다. 10자리 번호와 체크값을 확인하세요.");
      return;
    }
    setIsSaving(true);
    setSaveMessage("");

    try {
      const response = await fetch(withCompanyQuery("/api/customers"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: draftCustomer.address,
          businessNumber: formatBusinessRegistrationNumber(draftCustomer.businessNumber),
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
          validateBusinessNumber: draftBusinessNumberChanged && Boolean(draftCustomer.businessNumber),
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
      setSaveMessage(payload?.persisted === false ? "거래처 정보가 화면에 반영되었습니다. 서버 저장 상태는 관리자 시스템 점검에서 확인하세요." : "거래처 정보가 서버에 저장되었습니다.");
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
      companyName={isAdminPreview ? "선택 고객사" : "마주식자재"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      rightAction={
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
          href={withCompanyQuery("/routes/today")}
        >
          영업·배송 코스
        </Link>
      }
      subtitle="매장 기본정보, 사업자 상태, 배송 적재위치, 메모와 방문 기록을 거래처별로 관리합니다."
      title="거래처 히스토리"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <section className="mx-auto max-w-[1560px] space-y-4">
        <div className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[180px_repeat(4,minmax(0,1fr))]">
            <div className="rounded-md border border-slate-200/80 bg-slate-50/70 p-3">
              <p className="text-[11px] font-black text-slate-400">DB 상태</p>
              <Badge className={`mt-2 ${dbSummary.tone === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{dbSummary.label}</Badge>
            </div>
            <SummaryCard helper={`정제 ${formatDbCount(dbSummary.normalizedCustomers)}`} label="전체 거래처" value={`${customers.length}곳`} />
            <SummaryCard helper="매출 기준 우수 거래처" label="A등급" value={`${customers.filter((customer) => customer.grade === "A").length}곳`} tone="emerald" />
            <SummaryCard helper="검색·필터 적용 결과" label="현재 목록" value={`${filteredCustomers.length}곳`} tone="blue" />
            <SummaryCard helper={`방문 결과 ${formatDbCount(dbSummary.visitResults)}`} label="예상매출" value={`${expectedRevenue.toLocaleString()}만원`} tone="violet" />
          </div>
          {dbError ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">DB/API 확인 메시지: {dbError}</p> : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Badge className="mb-2 bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">거래처 운영 현황</Badge>
                <p className="text-base font-black text-slate-950">보완이 필요한 거래처를 먼저 정리하세요</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">사업자 상태, 연락처, 배송주소, 적재위치 기준으로 원장 완성도를 봅니다.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <MiniLedgerMetric label="운영 가능" value={`${readyCustomerCount.toLocaleString()}곳`} tone="ready" />
                <MiniLedgerMetric label="보완 필요" value={`${needsAttentionCustomers.length.toLocaleString()}곳`} tone="warning" />
              </div>
            </div>
          </div>
          <Link className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-950 p-4 text-white shadow-sm transition hover:bg-slate-800" href={withCompanyQuery("/")}>
            <span>
              <span className="block text-sm font-black">거래처 데이터 보완</span>
              <span className="mt-1 block text-xs font-bold text-slate-300">엑셀/수기로 기준값 업데이트</span>
            </span>
            <Plus className="h-5 w-5" />
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-200/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-slate-950">거래처 목록</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">검색, 등급, 담당자 기준으로 빠르게 찾습니다.</p>
                </div>
                <Badge className="bg-slate-100 text-slate-700">{filteredCustomers.length}/{customers.length}곳</Badge>
              </div>
            </div>
            <div className="border-b border-slate-200/80 bg-slate-50/70 p-3">
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="상호명, 주소, 사업자번호 검색"
                  value={customerSearch}
                />
              </label>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(["all", "A", "B", "C"] as const).map((grade) => (
                  <button
                    className={`h-9 rounded-md border text-xs font-black transition ${
                      gradeFilter === grade ? "border-teal-500 bg-teal-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                    }`}
                    key={grade}
                    onClick={() => setGradeFilter(grade)}
                    type="button"
                  >
                    {grade === "all" ? "전체" : `${grade}등급`}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <CustomerFilterButton
                  active={operationFilter === "business-check"}
                  count={businessCheckCount}
                  label="사업자 확인"
                  onClick={() => setOperationFilter(operationFilter === "business-check" ? "all" : "business-check")}
                  tone="danger"
                />
                <CustomerFilterButton
                  active={operationFilter === "loading-missing"}
                  count={loadingMissingCount}
                  label="적재위치 미등록"
                  onClick={() => setOperationFilter(operationFilter === "loading-missing" ? "all" : "loading-missing")}
                  tone="warning"
                />
                <CustomerFilterButton
                  active={operationFilter === "contact-missing"}
                  count={contactMissingCount}
                  label="연락처 미등록"
                  onClick={() => setOperationFilter(operationFilter === "contact-missing" ? "all" : "contact-missing")}
                />
                <CustomerFilterButton
                  active={operationFilter === "all"}
                  count={customers.length}
                  label="운영 전체"
                  onClick={() => setOperationFilter("all")}
                />
              </div>
            </div>
            <div className="max-h-[calc(100vh-360px)] space-y-2 overflow-auto p-3">
              {filteredCustomers.map(({ customer, index }) => {
                const issues = customerOperationalIssues(customer);
                const readyScore = Math.round(((4 - issues.length) / 4) * 100);
                return (
                  <button
                    key={`${customer.customerName}-${customer.address}`}
                    className={`w-full rounded-md border p-3 text-left transition ${
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
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-slate-400">원장 완성도 {readyScore}%</span>
                      <Badge className={issues.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                        {issues.length ? `${issues[0]} 필요` : "운영 가능"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-1">{customer.industry}</span>
                      <span className="rounded bg-slate-100 px-2 py-1">{customer.deliveryKm}km</span>
                      <span className="rounded bg-slate-100 px-2 py-1">{customer.monthlyRevenue}만원</span>
                      <span className="rounded bg-slate-100 px-2 py-1">{customer.deliveryManager}</span>
                    </div>
                  </button>
                );
              })}
              {!filteredCustomers.length ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-black text-slate-700">조건에 맞는 거래처가 없습니다.</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">검색어, 등급 또는 운영 필터를 바꿔보세요.</p>
                </div>
              ) : null}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm">
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

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoTile icon={Building2} label="사업자번호" value={selectedCustomer.businessNumber} />
                <InfoTile icon={Phone} label="연락처" value={selectedCustomer.phone} />
                <InfoTile icon={Banknote} label="월 매출" value={`${selectedCustomer.monthlyRevenue.toLocaleString()}만원`} />
                <InfoTile icon={Route} label="배송거리" value={`${selectedCustomer.deliveryKm}km`} />
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <PriorityTile label="배송 적재위치" value={selectedCustomer.loadingPosition || "미등록"} helper={`${loadingPositionAttachments}개 자료 등록`} tone="blue" />
                <PriorityTile label="히스토리 메모" value={`${customerNotes.length || selectedCustomer.memoCount}건`} helper="상담·배송 특이사항" tone="slate" />
                <PriorityTile label="담당 배송자" value={selectedCustomer.deliveryManager} helper={`${selectedCustomer.region} 권역`} tone="emerald" />
              </div>
              <OperationalActionStrip
                actionItems={operationalActionItems}
                completeCount={operationalReadyCount}
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                totalCount={operationalChecks.length}
              />
              <OperationalReadinessCard checks={operationalChecks} completeCount={operationalReadyCount} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-600">Customer Ledger</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">거래처 원장</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">사업자정보, 연락처, 주소, 배송 담당자를 한 곳에서 관리합니다.</p>
                  </div>
                  {isEditing ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!canSaveCustomer}
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
                  <>
                    <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/60 p-3">
                      <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                        <MapPin className="h-4 w-4 text-blue-700" />
                        주소 API 검색
                      </div>
                      <div className="mt-3 flex flex-col gap-2 lg:flex-row">
                        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
                          <Search className="h-4 w-4 text-slate-400" />
                          <input
                            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                            onChange={(event) => setAddressQuery(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                searchAddress();
                              }
                            }}
                            placeholder="도로명 또는 지번 주소 검색"
                            value={addressQuery}
                          />
                        </label>
                        <button
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          disabled={isAddressSearching}
                          onClick={searchAddress}
                          type="button"
                        >
                          <Search className="h-4 w-4" />
                          {isAddressSearching ? "검색 중" : "주소 검색"}
                        </button>
                      </div>
                      {addressSearchMessage ? <p className="mt-2 text-xs font-black text-blue-700">{addressSearchMessage}</p> : null}
                      {addressResults.length ? (
                        <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                          {addressResults.map((result) => (
                            <button
                              className="w-full rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                              key={`${result.address}-${result.longitude}-${result.latitude}`}
                              onClick={() => selectAddress(result)}
                              type="button"
                            >
                              <span className="block text-sm font-black text-slate-950">{result.address}</span>
                              {result.jibunAddress && result.jibunAddress !== result.address ? <span className="mt-1 block text-xs font-bold text-slate-500">지번 {result.jibunAddress}</span> : null}
                              <span className="mt-1 block text-xs font-black text-blue-700">
                                {result.region || "지역 자동 추출"} {result.postalCode ? `· 우편번호 ${result.postalCode}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <EditableField label="상호명" value={draftCustomer.customerName} onChange={(value) => updateDraft("customerName", value)} />
                      <EditableField
                        helper={
                          draftBusinessNumberChanged
                            ? draftBusinessNumberValid
                              ? `${formatBusinessRegistrationNumber(draftCustomer.businessNumber)} 검증 완료`
                              : "유효하지 않은 사업자번호입니다."
                            : "기존 번호 유지"
                        }
                        helperTone={draftBusinessNumberChanged && !draftBusinessNumberValid ? "danger" : draftBusinessNumberChanged ? "success" : "muted"}
                        label="사업자번호"
                        value={draftCustomer.businessNumber}
                        onChange={(value) => updateDraft("businessNumber", value)}
                      />
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
                      <EditableField className="md:col-span-2 xl:col-span-3" label="주소" value={draftCustomer.address} onChange={(value) => updateDraft("address", value)} />
                      <EditableField className="md:col-span-2 xl:col-span-3" label="배송 적재위치" value={draftCustomer.loadingPosition} onChange={(value) => updateDraft("loadingPosition", value)} />
                    </div>
                  </>
                ) : (
                  <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
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
                <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Field Assets</p>
                <h3 className="mt-1 text-base font-black text-slate-950">현장 첨부자료</h3>
                <p className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-black leading-6 text-blue-800">{selectedCustomer.loadingPosition}</p>
                <div className="mt-4 rounded-md border border-slate-200/80 bg-slate-50/70 p-3">
                  <p className="mb-3 text-xs font-black text-slate-500">자료 추가</p>
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

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-violet-600">History</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">메모 히스토리</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">상담, 배송 특이사항, 대표 요청사항을 시간순으로 누적합니다.</p>
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
                      className="h-10 rounded-md bg-teal-700 px-4 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!newMemo.trim() || isNoteSaving}
                      onClick={saveNote}
                      type="button"
                    >
                      {isNoteSaving ? "저장 중" : "메모 저장"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
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
                <div className="mt-4 max-h-[520px] space-y-3 overflow-auto pr-1">
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

function useAdminCompanyId() {
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    setCompanyId(getAdminCompanyIdFromUrl());
  }, []);

  return companyId;
}

function CustomerFilterButton({
  active,
  count,
  label,
  onClick,
  tone = "default"
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  tone?: "danger" | "default" | "warning";
}) {
  const activeClassName =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-teal-500 bg-teal-700 text-white";

  return (
    <button
      className={`flex h-9 items-center justify-between rounded-md border px-2.5 text-xs font-black transition ${
        active ? activeClassName : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="truncate">{label}</span>
      <span className={`ml-2 rounded-full px-1.5 py-0.5 ${active ? "bg-white/30" : "bg-slate-100 text-slate-500"}`}>{count}</span>
    </button>
  );
}

function OperationalReadinessCard({
  checks,
  completeCount
}: {
  checks: Array<{ description: string; ok: boolean; title: string }>;
  completeCount: number;
}) {
  const ready = completeCount === checks.length;

  return (
    <div className={`mt-4 rounded-md border p-4 ${ready ? "border-emerald-100 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
            거래처 운영 준비 상태
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">사업자정보, 연락처, 배송주소, 적재위치, 첨부자료, 메모 이력을 기준으로 확인합니다.</p>
        </div>
        <Badge className={ready ? "w-fit bg-emerald-100 text-emerald-800" : "w-fit bg-amber-100 text-amber-800"}>{completeCount}/{checks.length} 완료</Badge>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <div key={check.title} className="rounded-md border border-white/80 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-900">{check.title}</p>
              {check.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{check.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OperationalActionStrip({
  actionItems,
  completeCount,
  isEditing,
  onEdit,
  totalCount
}: {
  actionItems: Array<{ description: string; ok: boolean; title: string }>;
  completeCount: number;
  isEditing: boolean;
  onEdit: () => void;
  totalCount: number;
}) {
  const ready = completeCount === totalCount;

  return (
    <div className={`mt-4 rounded-md border p-4 ${ready ? "border-emerald-100 bg-emerald-50/70" : "border-blue-100 bg-blue-50/70"}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ready ? "bg-emerald-700 text-white" : "bg-blue-700 text-white"}>{ready ? "운영 준비 완료" : "운영 보완 필요"}</Badge>
            <span className="text-sm font-black text-slate-950">{completeCount}/{totalCount} 항목 완료</span>
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            {ready ? "이 거래처는 원장, 배송, 첨부, 메모 기준이 준비되어 있습니다." : "부족한 항목부터 보완하면 지도, 배송, 히스토리 품질이 좋아집니다."}
          </p>
        </div>
        <button
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-white px-3 text-xs font-black text-slate-800 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-60"
          disabled={isEditing}
          onClick={onEdit}
          type="button"
        >
          <Pencil className="h-3.5 w-3.5" />
          {isEditing ? "편집 중" : "부족 항목 수정"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {actionItems.map((item) => (
          <div key={item.title} className="rounded-md border border-white/80 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-900">{item.title}</p>
              {item.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
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

function MiniLedgerMetric({ label, tone, value }: { label: string; tone: "ready" | "warning"; value: string }) {
  const toneClassName = tone === "ready" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-amber-100 bg-amber-50 text-amber-800";

  return (
    <div className={`min-w-32 rounded-md border px-4 py-3 ${toneClassName}`}>
      <p className="text-[11px] font-black opacity-70">{label}</p>
      <p className="mt-1 text-xl font-black leading-none">{value}</p>
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
  helper = "",
  helperTone = "muted",
  label,
  onChange,
  value
}: {
  className?: string;
  helper?: string;
  helperTone?: "danger" | "muted" | "success";
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const helperClassName = {
    danger: "text-rose-600",
    muted: "text-slate-400",
    success: "text-emerald-700"
  }[helperTone];

  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-xs font-black text-slate-500">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {helper ? <span className={`mt-1.5 block text-xs font-black ${helperClassName}`}>{helper}</span> : null}
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

function customerOperationalIssues(customer: CustomerView) {
  const issues: string[] = [];
  if (customer.businessStatus !== "정상") issues.push("사업자 확인");
  if (!customer.phone || !customer.representativeName) issues.push("연락처");
  if (!customer.address) issues.push("배송주소");
  if (!customer.loadingPosition) issues.push("적재위치");
  return issues;
}

function formatDbCount(value: number | null) {
  return value === null ? "확인 필요" : `${value.toLocaleString()}건`;
}

function normalizeBusinessRegistrationNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function formatBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value).slice(0, 10);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function isValidBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value);
  if (!/^[0-9]{10}$/.test(digits)) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[9]);
}

function extractRegion(address: string) {
  const parts = address.split(/\s+/).filter(Boolean);
  return parts.find((part) => /(구|군|시|동|읍|면)$/.test(part)) || parts[1] || parts[0] || "";
}

const sampleVisitTimeline: TimelineItem[] = [
  {
    id: "history-001",
    expectedRevenue: 320,
    leadName: "성수 온반",
    memo: "대표가 단가표 재요청. 다음 방문 때 냉동 품목 제안 예정.",
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
