"use client";

import Link from "next/link";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Banknote, Building2, CheckCircle2, FileText, LinkIcon, MapPin, PackageCheck, Pencil, Phone, Plus, Route, Save, Search, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";

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
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  placeLinksCheckedAt?: string;
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

type CustomerDetailTab = "ledger" | "history";
type OperationFilter = "all" | "address-missing" | "business-check" | "business-number-missing" | "contact-missing" | "loading-missing" | "manager-missing";

const resultLabels: Record<string, string> = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

const customerDetailTabs: Array<{ description: string; icon: typeof Building2; id: CustomerDetailTab; label: string }> = [
  { description: "사업자정보, 배송 담당자, 첨부자료를 관리합니다.", icon: Building2, id: "ledger", label: "원장·첨부" },
  { description: "상담 메모와 영업 방문 기록을 누적합니다.", icon: FileText, id: "history", label: "메모·방문" }
];

const defaultDbSummary: DbSummary = {
  description: "DB 상태를 확인 중입니다. 실패해도 거래처 화면은 기준 데이터로 표시됩니다.",
  label: "DB 확인 중",
  normalizedCustomers: null,
  tone: "fallback",
  visitResults: null
};

const emptyCustomer: CustomerView = {
  address: "",
  businessNumber: "",
  businessStatus: "확인 필요",
  customerName: "거래처를 선택하세요",
  deliveryKm: 0,
  deliveryManager: "",
  email: "",
  grade: "C",
  industry: "",
  lastOrderDays: 0,
  loadingPosition: "",
  memoCount: 0,
  monthlyRevenue: 0,
  phone: "",
  region: "",
  representativeName: "",
  visitCount: 0
};

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

function getSelectedCustomerIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("customerId") || "";
}

function getOperationFilterFromUrl(): OperationFilter {
  if (typeof window === "undefined") return "all";
  const value = new URLSearchParams(window.location.search).get("operationFilter");
  return isOperationFilter(value) ? value : "all";
}

function withCompanyQuery(path: string) {
  const companyId = getAdminCompanyIdFromUrl();
  if (!companyId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
}

export default function CrmTimelinePage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [dbSummary, setDbSummary] = useState<DbSummary>(defaultDbSummary);
  const [dbError, setDbError] = useState("");
  const [customerSource, setCustomerSource] = useState<"loading" | "supabase" | "sample" | "error">("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<"all" | "A" | "B" | "C">("all");
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");

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

  const [customers, setCustomers] = useState<CustomerView[]>([]);

  useEffect(() => {
    let active = true;

    fetch(withCompanyQuery("/api/customers"), { cache: "no-store" })
      .then((response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        if (payload?.source !== "supabase") {
          setCustomerSource(payload?.source === "sample" ? "sample" : "error");
          setCustomers([]);
          setSelectedIndex(0);
          return;
        }
        const nextCustomers = Array.isArray(payload.customers) ? payload.customers : [];
        setCustomerSource("supabase");
        setCustomers(nextCustomers);
        const requestedCustomerId = getSelectedCustomerIdFromUrl();
        const requestedFilter = getOperationFilterFromUrl();
        const requestedIndex = requestedCustomerId ? nextCustomers.findIndex((customer: CustomerView) => customer.id === requestedCustomerId) : -1;
        const filteredIndex = requestedFilter === "all" ? -1 : nextCustomers.findIndex((customer: CustomerView) => customerMatchesOperationFilter(customer, requestedFilter));
        setOperationFilter(requestedFilter);
        setSelectedIndex(requestedIndex >= 0 ? requestedIndex : filteredIndex >= 0 ? filteredIndex : 0);
      })
      .catch(() => {
        if (!active) return;
        setCustomerSource("error");
        setCustomers([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedCustomer = customers[selectedIndex] || emptyCustomer;
  const hasCustomers = customers.length > 0;
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
  const [detailTab, setDetailTab] = useState<CustomerDetailTab>("ledger");
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const businessNumberInputRef = useRef<HTMLInputElement | null>(null);
  const deliveryManagerInputRef = useRef<HTMLInputElement | null>(null);
  const loadingPositionInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftCustomer(selectedCustomer ? { ...selectedCustomer } : null);
    setIsEditing(hasCustomers && operationFilter !== "all" && customerMatchesOperationFilter(selectedCustomer, operationFilter));
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
    setDetailTab("ledger");
  }, [operationFilter, selectedCustomer]);

  useEffect(() => {
    if (!isEditing) return;
    if (operationFilter === "all") return;
    const focusTarget = {
      "address-missing": addressInputRef,
      "business-check": businessNumberInputRef,
      "business-number-missing": businessNumberInputRef,
      "contact-missing": phoneInputRef,
      "loading-missing": loadingPositionInputRef,
      "manager-missing": deliveryManagerInputRef
    }[operationFilter];

    focusTarget?.current?.focus();
  }, [isEditing, operationFilter, selectedCustomer?.id]);

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
        const matchesOperation = customerMatchesOperationFilter(customer, operationFilter);
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
  const addressMissingCount = customers.filter((customer) => !customer.address).length;
  const businessCheckCount = customers.filter((customer) => customer.businessStatus !== "정상").length;
  const businessNumberMissingCount = customers.filter((customer) => !customer.businessNumber).length;
  const loadingMissingCount = customers.filter((customer) => !customer.loadingPosition).length;
  const contactMissingCount = customers.filter((customer) => !customer.phone || !customer.representativeName).length;
  const managerMissingCount = customers.filter((customer) => !customer.deliveryManager).length;
  const selectedFilteredPosition = filteredCustomers.findIndex(({ index }) => index === selectedIndex) + 1;
  const activeCleanupLabel = operationFilterLabel(operationFilter);
  const needsAttentionCustomers = customers.filter((customer) => customerOperationalIssues(customer).length > 0);
  const readyCustomerCount = customers.length - needsAttentionCustomers.length;
  const loadingPositionAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "loading_position").length;
  const businessCertificateAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "business_license").length;
  const bankAccountAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "bank_account").length;
  const attachmentChecklist = [
    {
      count: loadingPositionAttachments,
      description: "기사님이 현장에서 바로 보는 핵심 자료입니다.",
      label: "배송 적재위치",
      required: true,
      type: "loading_position"
    },
    {
      count: businessCertificateAttachments,
      description: "OCR로 기본정보를 채우고 사업자 상태를 검수합니다.",
      label: "사업자등록증",
      required: true,
      type: "business_license"
    },
    {
      count: bankAccountAttachments,
      description: "정산과 결제정보 확인에 사용합니다.",
      label: "통장사본",
      required: true,
      type: "bank_account"
    }
  ];
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
  const ledgerProgress = Math.round((operationalReadyCount / operationalChecks.length) * 100);
  const urgentOperationalChecks = operationalChecks.filter((check) => !check.ok).slice(0, 3);
  const operationalActionItems = urgentOperationalChecks.length
    ? urgentOperationalChecks
    : operationalChecks.slice(0, 3);
  const historyCount = customerNotes.length || selectedCustomer.memoCount;
  const nextActionCount = customerNotes.filter((note) => note.nextAction).length;
  const latestNote = customerNotes[0];
  const deliveryProofAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "delivery_proof").length;
  const fieldRecordSummary = {
    attachmentCount: customerAttachments.length,
    deliveryProofCount: deliveryProofAttachments,
    loadingPositionCount: loadingPositionAttachments,
    memoCount: historyCount,
    recentMemoAt: latestNote?.createdAt || "서버 이력 대기",
    visitCount: selectedCustomer.visitCount
  };
  const draftBusinessNumberChanged = Boolean(
    draftCustomer && normalizeBusinessRegistrationNumber(draftCustomer.businessNumber) !== normalizeBusinessRegistrationNumber(selectedCustomer.businessNumber)
  );
  const draftBusinessNumberValid = !draftCustomer?.businessNumber || isValidBusinessRegistrationNumber(draftCustomer.businessNumber);
  const canSaveCustomer = !isSaving && (!draftBusinessNumberChanged || draftBusinessNumberValid);

  function applyOperationFilter(nextFilter: OperationFilter) {
    const resolvedFilter = operationFilter === nextFilter ? "all" : nextFilter;
    setOperationFilter(resolvedFilter);

    const nextIndex = resolvedFilter === "all" ? 0 : customers.findIndex((customer) => customerMatchesOperationFilter(customer, resolvedFilter));
    if (nextIndex >= 0) setSelectedIndex(nextIndex);
  }

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
          naverPlaceUrl: draftCustomer.naverPlaceUrl,
          kakaoPlaceUrl: draftCustomer.kakaoPlaceUrl,
          googleMapUrl: draftCustomer.googleMapUrl,
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
      const nextCustomers = customers.map((customer, index) => (index === selectedIndex ? saved : customer));
      const shouldMoveToNext = operationFilter !== "all" && !customerMatchesOperationFilter(saved, operationFilter);
      const nextIndex = shouldMoveToNext ? findNextMatchingCustomerIndex(nextCustomers, operationFilter, selectedIndex) : -1;
      const movedToNext = nextIndex >= 0;

      setCustomers(nextCustomers);
      if (movedToNext) setSelectedIndex(nextIndex);
      setDraftCustomer(movedToNext ? nextCustomers[nextIndex] : saved);
      setIsEditing(!movedToNext && operationFilter !== "all");
      setSaveMessage(
        payload?.persisted === false
          ? "거래처 정보가 화면에 반영되었습니다. 서버 저장 상태는 관리자 시스템 점검에서 확인하세요."
          : movedToNext
            ? "저장되었습니다. 같은 보완 조건의 다음 거래처로 이동했습니다."
            : shouldMoveToNext
              ? "저장되었습니다. 현재 보완 필터의 남은 거래처가 없습니다."
            : "거래처 정보가 서버에 저장되었습니다."
      );
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
        <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm">
          <SectionHeader
            eyebrow="01 · 원장 요약"
            title="거래처 원장 요약"
            description="DB 상태, 전체 거래처 수, 매출 등급, 현재 필터 결과를 먼저 확인합니다."
          />
          <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[160px_repeat(4,minmax(0,1fr))]">
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
          {!hasCustomers ? (
            <div className="mx-4 mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-900">
                {customerSource === "loading" ? "거래처 원장을 불러오는 중입니다." : "실제 거래처 원장 데이터가 아직 연결되지 않았습니다."}
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-amber-800">
                샘플 거래처는 더 이상 히스토리 화면에 실제 데이터처럼 표시하지 않습니다. 데이터 등록에서 거래처 마스터를 저장하면 대시보드, 영업·배송 코스, 거래처 히스토리가 같은 원장 기준으로 연결됩니다.
              </p>
            </div>
          ) : null}
          <CustomerLedgerBasisPanel
            addressMissingCount={addressMissingCount}
            businessNumberMissingCount={businessNumberMissingCount}
            customerCount={customers.length}
            filteredCount={filteredCustomers.length}
            loadingReadyCount={customers.filter((customer) => Boolean(customer.loadingPosition)).length}
            managerMissingCount={managerMissingCount}
            managerCount={new Set(customers.map((customer) => customer.deliveryManager).filter(Boolean)).size}
            memoCount={customers.reduce((sum, customer) => sum + customer.memoCount, 0)}
          />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
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

        <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm">
          <SectionHeader
            eyebrow="02 · 목록과 상세"
            title="거래처 목록과 상세 관리"
            description="왼쪽에서 거래처를 고르고 오른쪽에서 기본정보, 첨부자료, 메모 히스토리를 정리합니다."
          />
          <div className="grid gap-4 border-t border-slate-200/80 bg-slate-50/50 p-4 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
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
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-1.5">
                <p className="px-2 pb-1 text-[11px] font-black uppercase tracking-wide text-slate-400">매출 등급</p>
                <div className="grid grid-cols-4 gap-1.5">
                {(["all", "A", "B", "C"] as const).map((grade) => (
                  <button
                    className={`h-9 rounded-md border text-xs font-black transition ${
                      gradeFilter === grade
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_6px_14px_rgba(15,23,42,0.14)]"
                        : "border-transparent bg-slate-50 text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800"
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
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-1.5">
                <p className="px-2 pb-1 text-[11px] font-black uppercase tracking-wide text-slate-400">운영 상태</p>
                <div className="grid grid-cols-2 gap-1.5">
                <CustomerFilterButton
                  active={operationFilter === "address-missing"}
                  count={addressMissingCount}
                  label="주소 미등록"
                  onClick={() => applyOperationFilter("address-missing")}
                  tone="danger"
                />
                <CustomerFilterButton
                  active={operationFilter === "business-number-missing"}
                  count={businessNumberMissingCount}
                  label="사업자번호 미등록"
                  onClick={() => applyOperationFilter("business-number-missing")}
                  tone="warning"
                />
                <CustomerFilterButton
                  active={operationFilter === "business-check"}
                  count={businessCheckCount}
                  label="사업자 확인"
                  onClick={() => applyOperationFilter("business-check")}
                  tone="danger"
                />
                <CustomerFilterButton
                  active={operationFilter === "loading-missing"}
                  count={loadingMissingCount}
                  label="적재위치 미등록"
                  onClick={() => applyOperationFilter("loading-missing")}
                  tone="warning"
                />
                <CustomerFilterButton
                  active={operationFilter === "contact-missing"}
                  count={contactMissingCount}
                  label="연락처 미등록"
                  onClick={() => applyOperationFilter("contact-missing")}
                />
                <CustomerFilterButton
                  active={operationFilter === "manager-missing"}
                  count={managerMissingCount}
                  label="담당자 미지정"
                  onClick={() => applyOperationFilter("manager-missing")}
                />
                <CustomerFilterButton
                  active={operationFilter === "all"}
                  count={customers.length}
                  label="운영 전체"
                  onClick={() => setOperationFilter("all")}
                />
                </div>
              </div>
              <CleanupWorkStatus
                filterLabel={activeCleanupLabel}
                filteredCount={filteredCustomers.length}
                isActive={operationFilter !== "all"}
                onClear={() => setOperationFilter("all")}
                selectedPosition={selectedFilteredPosition}
              />
            </div>
            <div className="max-h-[640px] space-y-2 overflow-auto p-3">
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
                  <p className="text-sm font-black text-slate-700">{hasCustomers ? "조건에 맞는 거래처가 없습니다." : "등록된 거래처가 없습니다."}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {hasCustomers ? "검색어, 등급 또는 운영 필터를 바꿔보세요." : "거래처 마스터를 업로드하거나 수기로 등록하면 이곳에 표시됩니다."}
                  </p>
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
                progress={ledgerProgress}
                onEdit={() => {
                  if (hasCustomers) setIsEditing(true);
                }}
                totalCount={operationalChecks.length}
              />
              <OperationalReadinessCard checks={operationalChecks} completeCount={operationalReadyCount} />
              <FieldRecordTracePanel
                summary={fieldRecordSummary}
                onOpenHistory={() => setDetailTab("history")}
                onOpenLedger={() => setDetailTab("ledger")}
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">거래처 상세 탭</p>
                  <p className="mt-1 truncate text-sm font-black text-slate-950">{customerDetailTabs.find((tab) => tab.id === detailTab)?.description}</p>
                </div>
                <div className="grid w-full gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_1px_0_rgba(15,23,42,0.03)] sm:w-auto sm:grid-cols-2">
                  {customerDetailTabs.map((tab) => {
                    const Icon = tab.icon;
                    const selected = detailTab === tab.id;
                    return (
                      <button
                        className={`group min-w-[132px] rounded-lg border px-3 py-2.5 text-left transition ${
                          selected
                            ? "border-teal-700 bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.18)]"
                            : "border-transparent bg-slate-50 text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800"
                        }`}
                        key={tab.id}
                        onClick={() => setDetailTab(tab.id)}
                        type="button"
                      >
                        <span className="flex items-center gap-2 text-sm font-black">
                          <Icon className={`h-4 w-4 ${selected ? "text-white" : "text-slate-400 group-hover:text-teal-700"}`} />
                          {tab.label}
                        </span>
                        <span className={`mt-1 block truncate text-[11px] font-bold ${selected ? "text-white/75" : "text-slate-400"}`}>
                          {tab.id === "ledger" ? "기본정보" : "이력관리"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {detailTab === "ledger" ? <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-600">Customer Ledger</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">기본정보 / 배송정보</h3>
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
                  <p className={`m-4 rounded-md p-3 text-xs font-bold ${saveMessage.includes("실패") || saveMessage.includes("오류") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {saveMessage}
                  </p>
                ) : null}
                {isEditing && draftCustomer ? (
                  <div className="p-4">
                    <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3">
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
                            ref={addressInputRef}
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
                    <div className="mt-4 grid gap-x-3 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
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
                        inputRef={businessNumberInputRef}
                        onChange={(value) => updateDraft("businessNumber", value)}
                      />
                      <EditableField label="대표자명" value={draftCustomer.representativeName} onChange={(value) => updateDraft("representativeName", value)} />
                      <EditableField label="연락처" value={draftCustomer.phone} inputRef={phoneInputRef} onChange={(value) => updateDraft("phone", value)} />
                      <EditableField label="이메일" value={draftCustomer.email} onChange={(value) => updateDraft("email", value)} />
                      <EditableField label="업종" value={draftCustomer.industry} onChange={(value) => updateDraft("industry", value)} />
                      <EditableField label="지역" value={draftCustomer.region} onChange={(value) => updateDraft("region", value)} />
                      <EditableField label="월 매출(만원)" value={String(draftCustomer.monthlyRevenue)} onChange={(value) => updateDraft("monthlyRevenue", value)} />
                      <EditableField label="배송담당자" value={draftCustomer.deliveryManager} inputRef={deliveryManagerInputRef} onChange={(value) => updateDraft("deliveryManager", value)} />
                      <EditableField label="배송거리(km)" value={String(draftCustomer.deliveryKm)} onChange={(value) => updateDraft("deliveryKm", value)} />
                      <EditableField label="최근 주문일" value={String(draftCustomer.lastOrderDays)} onChange={(value) => updateDraft("lastOrderDays", value)} />
                      <EditableField label="방문횟수" value={String(draftCustomer.visitCount)} onChange={(value) => updateDraft("visitCount", value)} />
                      <EditableField className="md:col-span-2 xl:col-span-3" label="주소" value={draftCustomer.address} onChange={(value) => updateDraft("address", value)} />
                      <EditableField className="md:col-span-2 xl:col-span-3" label="배송 적재위치" value={draftCustomer.loadingPosition} inputRef={loadingPositionInputRef} onChange={(value) => updateDraft("loadingPosition", value)} />
                      <EditableField className="md:col-span-2 xl:col-span-3" helper="네이버 리뷰, 영업시간, 업체 상태 추적에 활용합니다." label="네이버 플레이스 링크" value={draftCustomer.naverPlaceUrl || ""} onChange={(value) => updateDraft("naverPlaceUrl", value)} />
                      <EditableField className="md:col-span-2 xl:col-span-3" helper="카카오맵 장소 상세와 로드뷰 확인에 활용합니다." label="카카오맵 링크" value={draftCustomer.kakaoPlaceUrl || ""} onChange={(value) => updateDraft("kakaoPlaceUrl", value)} />
                      <EditableField className="md:col-span-2 xl:col-span-3" helper="구글 리뷰와 지도 정보를 함께 확인할 때 활용합니다." label="구글맵 링크" value={draftCustomer.googleMapUrl || ""} onChange={(value) => updateDraft("googleMapUrl", value)} />
                    </div>
                  </div>
                ) : (
                  <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
                    <div className="p-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">사업자 정보</p>
                      <DetailRow label="상호명" value={selectedCustomer.customerName} />
                      <DetailRow label="사업자번호" value={selectedCustomer.businessNumber} />
                      <DetailRow label="대표자명" value={selectedCustomer.representativeName} />
                      <DetailRow label="업종" value={selectedCustomer.industry} />
                      <DetailRow label="사업자상태" value={selectedCustomer.businessStatus} />
                    </div>
                    <div className="p-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">배송 / 운영 정보</p>
                      <DetailRow label="지역" value={selectedCustomer.region} />
                      <DetailRow label="주소" value={selectedCustomer.address} />
                      <DetailRow label="담당자" value={selectedCustomer.deliveryManager} />
                      <DetailRow label="배송거리" value={`${selectedCustomer.deliveryKm}km`} />
                      <DetailRow label="최근 주문" value={`${selectedCustomer.lastOrderDays}일 전`} />
                    </div>
                    <div className="p-4 md:col-span-2">
                      <PlaceLinksPanel customer={selectedCustomer} onEdit={() => {
                        if (hasCustomers) setIsEditing(true);
                      }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
                <div className="border-b border-slate-200/80 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Field Assets</p>
                  <h3 className="mt-1 text-base font-black text-slate-950">첨부자료 / 적재위치</h3>
                </div>
                <div className="p-4">
                  <LoadingPositionFieldCard
                    attachmentCount={loadingPositionAttachments}
                    loadingPosition={selectedCustomer.loadingPosition}
                    onSelectUpload={() => {
                      setNewAttachmentType("loading_position");
                      setNewAttachmentTitle(attachmentTitleFromType("loading_position"));
                    }}
                  />
                  <AttachmentChecklistPanel checklist={attachmentChecklist} />
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
                  <div className="mt-4 overflow-hidden rounded-md border border-slate-200/80 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-black text-slate-500">등록된 첨부자료</p>
                      <Badge className="bg-slate-100 text-slate-700">{customerAttachments.length}건</Badge>
                    </div>
                    <div className="grid gap-0">
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
              </div>
            </div> : null}

            {detailTab === "history" ? <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-violet-600">History</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">메모 히스토리</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">상담, 배송 특이사항, 대표 요청사항을 시간순으로 누적합니다.</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700">{customerNotes.length || selectedCustomer.memoCount}건</Badge>
                </div>
                <div className="border-b border-slate-200/80 bg-slate-50/50 p-4">
                  <HistoryInputSummary
                    historyCount={historyCount}
                    latestNote={latestNote}
                    nextActionCount={nextActionCount}
                  />
                  <div className="mt-3 rounded-md border border-slate-200/80 bg-white p-3">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {[
                        "대표 요청사항 확인 필요",
                        "배송 특이사항 있음",
                        "견적서 발송 예정",
                        "다음 방문 일정 조율"
                      ].map((template) => (
                        <button
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-black text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                          key={template}
                          onClick={() => setNewMemo((current) => (current ? `${current}\n${template}` : template))}
                          type="button"
                        >
                          {template}
                        </button>
                      ))}
                    </div>
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
                </div>
                <div className="grid gap-0 divide-y divide-slate-100">
                  {customerNotes.length ? (
                    customerNotes.map((note) => (
                      <div key={note.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <Badge className="bg-slate-100 text-slate-700">{noteTypeLabel(note.noteType)}</Badge>
                          <span className="text-xs font-bold text-slate-400">{note.createdAt}</span>
                        </div>
                        <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{note.memo}</p>
                        {note.nextAction ? <p className="mt-2 text-xs font-black text-blue-700">다음 액션: {note.nextAction}</p> : null}
                      </div>
                    ))
                  ) : (
                    <div className="m-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm font-black text-slate-700">아직 서버 메모가 없습니다.</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        상담 내용, 배송 특이사항, 대표 요청사항을 저장하면 이곳에 시간순으로 쌓입니다. 기존 메모 기록은 {selectedCustomer.memoCount}건입니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
                <div className="border-b border-slate-200/80 bg-slate-50 px-4 py-3">
                  <Badge className="mb-2 bg-violet-50 text-violet-700">영업 방문 기록</Badge>
                  <h3 className="text-base font-black text-slate-950">최근 액션</h3>
                </div>
                <div className="max-h-[620px] divide-y divide-slate-100 overflow-auto">
                  {timeline.map((item) => (
                    <div key={item.id} className="p-4">
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
            </div> : null}
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

function SectionHeader({ description, eyebrow, title }: { description: string; eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-200/80 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-teal-700">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-500">{description}</p>
    </div>
  );
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
      ? "border-rose-300 bg-rose-50 text-rose-700 shadow-[0_4px_10px_rgba(225,29,72,0.08)]"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-800 shadow-[0_4px_10px_rgba(217,119,6,0.08)]"
        : "border-teal-700 bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]";

  return (
    <button
      className={`flex h-10 items-center justify-between rounded-md border px-2.5 text-xs font-black transition ${
        active ? activeClassName : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="truncate">{label}</span>
      <span className={`ml-2 rounded-full px-1.5 py-0.5 ${active ? "bg-white/30" : "bg-slate-100 text-slate-500"}`}>{count}</span>
    </button>
  );
}

function CleanupWorkStatus({
  filterLabel,
  filteredCount,
  isActive,
  onClear,
  selectedPosition
}: {
  filterLabel: string;
  filteredCount: number;
  isActive: boolean;
  onClear: () => void;
  selectedPosition: number;
}) {
  if (!isActive) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-500">
        운영 상태 필터를 선택하면 보완 대상만 모아보고 저장 후 다음 대상으로 이동합니다.
      </div>
    );
  }

  const progressLabel = filteredCount > 0 && selectedPosition > 0 ? `${selectedPosition}/${filteredCount}` : `0/${filteredCount}`;

  return (
    <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/80 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black text-teal-900">현재 보완 작업</p>
          <p className="mt-1 text-sm font-black text-slate-950">
            {filterLabel} · {progressLabel}건
          </p>
        </div>
        <button
          className="inline-flex h-8 w-fit items-center justify-center rounded-md border border-teal-200 bg-white px-3 text-xs font-black text-teal-800 hover:bg-teal-50"
          onClick={onClear}
          type="button"
        >
          필터 해제
        </button>
      </div>
      <p className="mt-2 text-xs font-bold leading-5 text-teal-800">
        저장하면 조건이 해결된 거래처는 목록에서 빠지고, 다음 보완 대상으로 자동 이동합니다.
      </p>
    </div>
  );
}

function CustomerLedgerBasisPanel({
  addressMissingCount,
  businessNumberMissingCount,
  customerCount,
  filteredCount,
  loadingReadyCount,
  managerMissingCount,
  managerCount,
  memoCount
}: {
  addressMissingCount: number;
  businessNumberMissingCount: number;
  customerCount: number;
  filteredCount: number;
  loadingReadyCount: number;
  managerMissingCount: number;
  managerCount: number;
  memoCount: number;
}) {
  const items = [
    { label: "전체 원장", value: `${customerCount.toLocaleString()}곳`, helper: "대시보드 거래처 기준" },
    { label: "현재 필터", value: `${filteredCount.toLocaleString()}곳`, helper: "목록·상세 표시 기준" },
    { label: "배송 담당자", value: `${managerCount.toLocaleString()}명`, helper: "코스 필터 기준" },
    { label: "적재위치", value: `${loadingReadyCount.toLocaleString()}곳`, helper: "배송기사 앱 기준" },
    { label: "메모 이력", value: `${memoCount.toLocaleString()}건`, helper: "방문·상담 히스토리" }
  ];
  const attentionItems = [
    { label: "주소 미등록", value: addressMissingCount },
    { label: "사업자번호 미등록", value: businessNumberMissingCount },
    { label: "담당자 미지정", value: managerMissingCount }
  ];
  const attentionTotal = attentionItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-slate-50/70">
      <div className="grid gap-2 border-b border-slate-200 bg-white px-3 py-3 text-xs font-bold leading-5 text-slate-600 lg:grid-cols-[160px_minmax(0,1fr)] lg:items-center">
        <p className="font-black text-slate-950">거래처 기준값</p>
        <p>이 화면의 원장 수, 배송 담당자, 적재위치, 메모 수는 대시보드와 영업·배송 코스의 기준 데이터로 사용됩니다.</p>
      </div>
      <div className="grid divide-y divide-slate-200 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {items.map((item) => (
          <div className="min-w-0 px-3 py-3" key={item.label}>
            <p className="text-[11px] font-black uppercase text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950">{item.value}</p>
            <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{item.helper}</p>
          </div>
        ))}
      </div>
      <div className={`grid gap-2 border-t px-3 py-3 text-xs font-bold leading-5 md:grid-cols-[160px_minmax(0,1fr)] md:items-center ${attentionTotal ? "border-amber-200 bg-amber-50/80 text-amber-900" : "border-emerald-100 bg-emerald-50/70 text-emerald-900"}`}>
        <p className="font-black">{attentionTotal ? `보완 필요 ${attentionTotal.toLocaleString()}건` : "필수값 정상"}</p>
        <div className="flex flex-wrap gap-2">
          {attentionItems.map((item) => (
            <span className="rounded-full bg-white px-2.5 py-1 font-black" key={item.label}>
              {item.label} {item.value.toLocaleString()}건
            </span>
          ))}
        </div>
      </div>
    </div>
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

function FieldRecordTracePanel({
  onOpenHistory,
  onOpenLedger,
  summary
}: {
  onOpenHistory: () => void;
  onOpenLedger: () => void;
  summary: {
    attachmentCount: number;
    deliveryProofCount: number;
    loadingPositionCount: number;
    memoCount: number;
    recentMemoAt: string;
    visitCount: number;
  };
}) {
  const items = [
    {
      action: onOpenHistory,
      helper: `최근 기록 ${summary.recentMemoAt}`,
      icon: FileText,
      label: "메모·방문",
      value: `${summary.memoCount.toLocaleString()}건`
    },
    {
      action: onOpenLedger,
      helper: "사진·영상·PDF 전체",
      icon: PackageCheck,
      label: "첨부자료",
      value: `${summary.attachmentCount.toLocaleString()}건`
    },
    {
      action: onOpenLedger,
      helper: "기사 확인용 핵심 자료",
      icon: MapPin,
      label: "적재위치",
      value: `${summary.loadingPositionCount.toLocaleString()}건`
    },
    {
      action: onOpenHistory,
      helper: "모바일 완료 증빙",
      icon: CheckCircle2,
      label: "배송완료",
      value: `${summary.deliveryProofCount.toLocaleString()}건`
    }
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-teal-100 bg-gradient-to-r from-teal-50 via-white to-blue-50">
      <div className="flex flex-col gap-3 border-b border-teal-100/80 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Field Record Trace</p>
          <h3 className="mt-1 text-base font-black text-slate-950">모바일 현장 기록 추적</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            직원이 모바일에서 남긴 배송완료, 적재위치, 방문 메모를 거래처 원장과 히스토리에서 확인합니다.
          </p>
        </div>
        <Badge className="w-fit bg-white text-teal-800 ring-1 ring-teal-100">방문 {summary.visitCount.toLocaleString()}회 기준</Badge>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="rounded-md border border-white bg-white/90 p-3 text-left shadow-sm transition hover:border-teal-200 hover:bg-white hover:shadow-md"
              key={item.label}
              onClick={item.action}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-lg font-black text-slate-950">{item.value}</span>
              </div>
              <p className="mt-3 text-sm font-black text-slate-900">{item.label}</p>
              <p className="mt-1 truncate text-xs font-bold text-slate-500">{item.helper}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OperationalActionStrip({
  actionItems,
  completeCount,
  isEditing,
  onEdit,
  progress,
  totalCount
}: {
  actionItems: Array<{ description: string; ok: boolean; title: string }>;
  completeCount: number;
  isEditing: boolean;
  onEdit: () => void;
  progress: number;
  totalCount: number;
}) {
  const ready = completeCount === totalCount;

  return (
    <div className={`mt-4 rounded-md border p-4 ${ready ? "border-emerald-100 bg-emerald-50/70" : "border-blue-100 bg-blue-50/70"}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ready ? "bg-emerald-700 text-white" : "bg-blue-700 text-white"}>{ready ? "운영 준비 완료" : "운영 보완 필요"}</Badge>
            <span className="text-sm font-black text-slate-950">{completeCount}/{totalCount} 항목 완료 · {progress}%</span>
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            {ready ? "이 거래처는 원장, 배송, 첨부, 메모 기준이 준비되어 있습니다." : "부족한 항목부터 보완하면 지도, 배송, 히스토리 품질이 좋아집니다."}
          </p>
          <div className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-white">
            <div className={`h-full rounded-full ${ready ? "bg-emerald-600" : "bg-blue-700"}`} style={{ width: `${progress}%` }} />
          </div>
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
      <p className={`mt-2 truncate text-[24px] font-black leading-none ${toneClassName}`} title={value}>
        {value}
      </p>
      <p className="mt-2 truncate text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200/80 bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
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

function HistoryInputSummary({
  historyCount,
  latestNote,
  nextActionCount
}: {
  historyCount: number;
  latestNote?: CustomerNoteView;
  nextActionCount: number;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="rounded-md border border-violet-100 bg-violet-50/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-white text-violet-700 ring-1 ring-inset ring-violet-200">기록 요약</Badge>
          <Badge className="bg-violet-700 text-white">{historyCount}건</Badge>
        </div>
        <p className="mt-2 text-sm font-black text-slate-950">
          {latestNote ? "최근 메모가 서버 이력으로 관리 중입니다." : "아직 서버 메모가 없습니다."}
        </p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
          {latestNote ? latestNote.memo : "상담, 배송 특이사항, 대표 요청사항을 남기면 거래처별 히스토리로 누적됩니다."}
        </p>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <p className="text-xs font-black text-slate-500">다음 액션</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{nextActionCount}건</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
          견적 발송, 재방문, 배송 확인처럼 후속 업무를 별도로 남겨두세요.
        </p>
      </div>
    </div>
  );
}

function LoadingPositionFieldCard({
  attachmentCount,
  loadingPosition,
  onSelectUpload
}: {
  attachmentCount: number;
  loadingPosition: string;
  onSelectUpload: () => void;
}) {
  const ready = Boolean(loadingPosition && attachmentCount > 0);

  return (
    <div className={`rounded-md border p-4 ${ready ? "border-blue-100 bg-blue-50/80" : "border-amber-200 bg-amber-50/80"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ready ? "bg-blue-700 text-white" : "bg-amber-500 text-white"}>배송 핵심</Badge>
            <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{attachmentCount}개 자료</Badge>
          </div>
          <h4 className="mt-3 text-base font-black text-slate-950">배송 적재위치</h4>
          <p className="mt-2 rounded-md border border-white/80 bg-white px-3 py-2 text-sm font-black leading-6 text-blue-900">
            {loadingPosition || "배송 적재위치가 아직 등록되지 않았습니다."}
          </p>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-600">
            배송기사 앱에서는 이 값과 사진/영상이 가장 먼저 보여야 합니다. 후문, 냉장창고, 상차 가능 시간처럼 현장 기준으로 남겨두세요.
          </p>
        </div>
        <button
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-black text-white transition hover:bg-blue-800"
          onClick={onSelectUpload}
          type="button"
        >
          <Plus className="h-4 w-4" />
          적재위치 자료 추가
        </button>
      </div>
    </div>
  );
}

function AttachmentChecklistPanel({
  checklist
}: {
  checklist: Array<{ count: number; description: string; label: string; required: boolean; type: string }>;
}) {
  const readyCount = checklist.filter((item) => item.count > 0 || !item.required).length;
  const progress = checklist.length ? Math.round((readyCount / checklist.length) * 100) : 0;

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">첨부자료 준비 상태</p>
          <p className="mt-1 text-xs font-bold text-slate-500">필수 자료가 채워질수록 거래처 원장과 현장 운영 신뢰도가 올라갑니다.</p>
        </div>
        <Badge className={progress === 100 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
          {readyCount}/{checklist.length} 완료
        </Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid gap-2">
        {checklist.map((item) => (
          <div
            key={item.type}
            className={`rounded-md border p-3 ${
              item.type === "loading_position"
                ? "border-blue-200 bg-blue-50/70"
                : item.count > 0
                  ? "border-emerald-100 bg-emerald-50/60"
                  : "border-amber-100 bg-amber-50/60"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950">
                  {item.label}
                  {item.type === "loading_position" ? <span className="ml-2 text-xs text-blue-700">최우선</span> : null}
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{item.description}</p>
              </div>
              <Badge className={item.count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                {item.count > 0 ? `${item.count}건` : item.required ? "필요" : "선택"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-10 grid-cols-[112px_minmax(0,1fr)] items-center border-b border-slate-100 text-sm last:border-b-0">
      <p className="h-full bg-slate-50 px-3 py-2.5 font-black text-slate-500">{label}</p>
      <p className="min-w-0 px-3 py-2.5 font-black text-slate-900 break-keep">{value}</p>
    </div>
  );
}

function PlaceLinksPanel({ customer, onEdit }: { customer: CustomerView; onEdit: () => void }) {
  const links = [
    { label: "네이버", purpose: "리뷰·영업시간", url: customer.naverPlaceUrl },
    { label: "카카오맵", purpose: "장소 상세·로드뷰", url: customer.kakaoPlaceUrl },
    { label: "구글맵", purpose: "리뷰·지도 보조", url: customer.googleMapUrl }
  ];
  const filledCount = links.filter((link) => Boolean(link.url?.trim())).length;
  const readinessLabel = filledCount === links.length ? "갱신 준비 완료" : filledCount > 0 ? "부분 연결" : "링크 필요";
  const readinessPercent = Math.round((filledCount / links.length) * 100);
  const nextAction =
    filledCount === links.length
      ? "외부 정보 변경 여부를 주기적으로 확인하세요."
      : "검색 링크에서 매장을 확인한 뒤 원장 편집으로 공식 링크를 저장하세요.";
  const updateTargets = [
    "상호명·주소 일치 여부",
    "영업시간·휴무일 변경",
    "휴폐업 또는 이전 신호",
    "리뷰 변화와 컴플레인 단서",
    "배송 적재위치와 로드뷰 확인"
  ];
  const searchLinks = buildPlaceSearchLinks([customer.customerName, customer.address].filter(Boolean).join(" "));

  return (
    <div className="overflow-hidden rounded-md border border-teal-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-teal-100 bg-teal-50/80 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">외부 매장 정보</p>
          <h4 className="mt-1 text-base font-black text-slate-950">네이버·카카오·구글 링크</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">리뷰, 영업시간, 휴폐업 확인, 로드뷰 확인에 사용할 기준 링크입니다.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge className={filledCount === links.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
            {filledCount}/{links.length} 등록
          </Badge>
          <Badge className={filledCount === links.length ? "bg-teal-100 text-teal-800" : "bg-white text-slate-700"}>
            {readinessLabel}
          </Badge>
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-teal-200 bg-white px-3 text-xs font-black text-teal-800 transition hover:bg-teal-100"
            onClick={onEdit}
            type="button"
          >
            <Pencil className="h-3.5 w-3.5" />
            링크 편집
          </button>
        </div>
      </div>
      <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            {links.map((link) => (
              <PlaceLinkButton key={link.label} label={link.label} purpose={link.purpose} url={link.url} />
            ))}
          </div>
          <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
            <PlaceInfoMetric helper={`${readinessPercent}%`} label="정보 갱신 상태" value={readinessLabel} />
            <PlaceInfoMetric label="마지막 확인" value={customer.placeLinksCheckedAt || "확인 전"} />
            <PlaceInfoMetric label="연결 플랫폼" value={`${filledCount}개`} />
            <PlaceInfoMetric label="우선 확인" value={filledCount < links.length ? "미등록 링크" : "리뷰·영업시간"} />
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black text-slate-500">갱신 대상 정보</p>
              <Badge className="bg-slate-100 text-slate-700">원장 보완 기준</Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {updateTargets.map((target, index) => (
                <div key={target} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-100 text-[11px] font-black text-teal-800">{index + 1}</span>
                  <span className="text-xs font-black text-slate-700">{target}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-500">링크 찾기</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{nextAction}</p>
          <div className="mt-2 grid gap-2">
            {searchLinks.map((link) => (
              <a
                className="inline-flex h-8 items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50"
                href={link.href}
                key={link.label}
                rel="noreferrer"
                target="_blank"
              >
                {link.label} 검색
                <LinkIcon className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-black text-amber-900">자동 수집 연결 전 기준</p>
            <p className="mt-1 text-xs font-bold leading-5 text-amber-800">
              플랫폼별 상세정보 자동 갱신은 공식 API와 이용 정책 확인 후 연결하고, 현재는 원장 링크를 기준값으로 관리합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceInfoMetric({ helper, label, value }: { helper?: string; label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-[11px] font-bold text-teal-700">{helper}</p> : null}
    </div>
  );
}

function PlaceLinkButton({ label, purpose, url = "" }: { label: string; purpose: string; url?: string }) {
  const available = Boolean(url.trim());

  if (!available) {
    return (
      <div className="min-h-16 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-black text-slate-600">{label}</span>
          <span className="text-xs font-black text-slate-400">미등록</span>
        </div>
        <p className="mt-1 text-xs font-bold text-slate-400">{purpose}</p>
      </div>
    );
  }

  return (
    <a
      className="block min-h-16 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-black text-teal-800 transition hover:border-teal-200 hover:bg-teal-100"
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="inline-flex items-center gap-1 text-xs">
          열기
          <LinkIcon className="h-3.5 w-3.5" />
        </span>
      </span>
      <span className="mt-1 block text-xs font-bold text-teal-700/80">{purpose}</span>
    </a>
  );
}

function buildPlaceSearchLinks(query: string) {
  const encodedQuery = encodeURIComponent(query || "매장");
  return [
    { href: `https://search.naver.com/search.naver?query=${encodedQuery}`, label: "네이버" },
    { href: `https://map.kakao.com/?q=${encodedQuery}`, label: "카카오맵" },
    { href: `https://www.google.com/maps/search/${encodedQuery}`, label: "구글맵" }
  ];
}

function EditableField({
  className = "",
  helper = "",
  helperTone = "muted",
  inputRef,
  label,
  onChange,
  value
}: {
  className?: string;
  helper?: string;
  helperTone?: "danger" | "muted" | "success";
  inputRef?: Ref<HTMLInputElement>;
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
    <label className={`block min-w-0 rounded-md border border-slate-200 bg-slate-50/60 p-2 ${className}`}>
      <span className="mb-1.5 block text-xs font-black text-slate-500">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        ref={inputRef}
        value={value}
      />
      {helper ? <span className={`mt-1.5 block text-xs font-black ${helperClassName}`}>{helper}</span> : null}
    </label>
  );
}

function AttachmentRow({ icon: Icon, label, url = "", value }: { icon: typeof PackageCheck; label: string; url?: string; value: string }) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </span>
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
  if (type === "delivery_proof") return "배송완료 증빙";
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
  if (type === "delivery_proof") return "배송완료 증빙";
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

function customerMatchesOperationFilter(customer: CustomerView, filter: OperationFilter) {
  if (filter === "all") return true;
  if (filter === "address-missing") return !customer.address;
  if (filter === "business-check") return customer.businessStatus !== "정상";
  if (filter === "business-number-missing") return !customer.businessNumber;
  if (filter === "contact-missing") return !customer.phone || !customer.representativeName;
  if (filter === "loading-missing") return !customer.loadingPosition;
  if (filter === "manager-missing") return !customer.deliveryManager;
  return true;
}

function findNextMatchingCustomerIndex(customers: CustomerView[], filter: OperationFilter, currentIndex: number) {
  if (filter === "all") return -1;
  const afterCurrent = customers.findIndex((customer, index) => index > currentIndex && customerMatchesOperationFilter(customer, filter));
  if (afterCurrent >= 0) return afterCurrent;
  return customers.findIndex((customer, index) => index < currentIndex && customerMatchesOperationFilter(customer, filter));
}

function operationFilterLabel(filter: OperationFilter) {
  if (filter === "address-missing") return "주소 미등록";
  if (filter === "business-check") return "사업자 확인";
  if (filter === "business-number-missing") return "사업자번호 미등록";
  if (filter === "contact-missing") return "연락처 미등록";
  if (filter === "loading-missing") return "적재위치 미등록";
  if (filter === "manager-missing") return "담당자 미지정";
  return "운영 전체";
}

function isOperationFilter(value: string | null): value is OperationFilter {
  return (
    value === "all" ||
    value === "address-missing" ||
    value === "business-check" ||
    value === "business-number-missing" ||
    value === "contact-missing" ||
    value === "loading-missing" ||
    value === "manager-missing"
  );
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
