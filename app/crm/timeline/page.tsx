"use client";

import Link from "next/link";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Banknote, Building2, CheckCircle2, ChevronLeft, ChevronRight, FileText, LinkIcon, MapPin, PackageCheck, PanelLeftClose, PanelLeftOpen, Pencil, Phone, Plus, RefreshCw, Route, Save, Search, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
import { SectionHeader } from "@/components/section-header";
import { WorkspaceSectionNav } from "@/components/workspace-section-nav";

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
  businessNumber?: string;
  businessStatus?: string;
  customerName: string;
  deliveryKm: number;
  deliveryManager?: string;
  email?: string;
  grade: "A" | "B" | "C";
  industry: string;
  lastOrderDays: number;
  loadingPosition?: string;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  placeLinksCheckedAt?: string;
  memoCount: number;
  monthlyRevenue: number;
  phone?: string;
  region: string;
  representativeName?: string;
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
  storagePath?: string;
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
  memo: "메모 저장",
  pending: "보류",
  failed: "실패"
};

const customerDetailTabs: Array<{ description: string; helper: string; icon: typeof Building2; id: CustomerDetailTab; label: string; shortLabel: string }> = [
  { description: "사업자정보, 배송 담당자, 첨부자료를 관리합니다.", helper: "사업자·주소·적재위치", icon: Building2, id: "ledger", label: "원장·첨부", shortLabel: "기본정보" },
  { description: "상담 메모와 영업 방문 기록을 누적합니다.", helper: "메모·방문·다음 액션", icon: FileText, id: "history", label: "메모·방문", shortLabel: "이력관리" }
];

const defaultDbSummary: DbSummary = {
  description: "DB 상태를 확인 중입니다. DB 거래처 원장이 확인되기 전까지 거래처 목록은 비워 둡니다.",
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

function syncOperationFilterUrl(filter: OperationFilter) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (filter === "all") {
    url.searchParams.delete("operationFilter");
  } else {
    url.searchParams.set("operationFilter", filter);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function syncSelectedCustomerUrl(customerId: string | undefined) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (customerId) {
    url.searchParams.set("customerId", customerId);
  } else {
    url.searchParams.delete("customerId");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

// Tailwind's JIT scanner needs complete, literal class strings (a template-interpolated
// `xl:grid-cols-[${...}]` is invisible to it), so both collapsed states are spelled out here.
function customerListGridColsClassName(listCollapsed: boolean) {
  return listCollapsed ? "xl:grid-cols-[220px_minmax(0,1fr)]" : "xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[400px_minmax(0,1fr)]";
}

export default function CrmTimelinePage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineSource, setTimelineSource] = useState<"empty" | "supabase">("empty");
  const [dbSummary, setDbSummary] = useState<DbSummary>(defaultDbSummary);
  const [dbError, setDbError] = useState("");
  const [customerSource, setCustomerSource] = useState<"loading" | "supabase" | "sample" | "error">("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  // 거래처 검색·목록 사이드바가 항상 펼쳐져 있으면 옆의 선택 거래처 상세(원장/첨부자료)가 계속
  // 좁게 눌려 보였습니다. 거래처를 고르면 자동으로 목록을 접어 상세가 전체 폭을 쓰도록 하고,
  // 필요하면 다시 펼칠 수 있게 했습니다.
  const [listCollapsed, setListCollapsed] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<"all" | "A" | "B" | "C">("all");
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");

  useEffect(() => {
    let active = true;

    fetch(withCompanyQuery("/api/customer/history-status"), { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setTimeline(Array.isArray(payload?.timeline) ? payload.timeline : []);
        setTimelineSource(payload?.timelineSource === "supabase" ? "supabase" : "empty");
        if (payload?.dbSummary) setDbSummary(payload.dbSummary);
        if (payload?.errorMessage) setDbError(payload.errorMessage);
      })
      .catch((error) => {
        if (!active) return;
        setDbError(error instanceof Error ? error.message : "DB 상태 API 호출 실패");
        setDbSummary({
          description: "DB 상태 API 호출에 실패했습니다. DB 거래처 원장 연결 상태를 먼저 확인해야 합니다.",
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
  const [customersTruncated, setCustomersTruncated] = useState(false);
  const [isLoadingMoreCustomers, setIsLoadingMoreCustomers] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

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
        setCustomersTruncated(Boolean(payload.truncated));
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

  const loadMoreCustomers = async () => {
    if (isLoadingMoreCustomers || !customersTruncated) return;
    setIsLoadingMoreCustomers(true);
    setLoadMoreError("");

    try {
      const response = await fetch(withCompanyQuery(`/api/customers?offset=${customers.length}`), { cache: "no-store" });
      if (!response.ok) throw new Error("추가 거래처를 불러오지 못했습니다.");
      const payload = await response.json();
      if (payload?.source !== "supabase") throw new Error("추가 거래처를 불러오지 못했습니다.");
      const nextBatch = Array.isArray(payload.customers) ? payload.customers : [];
      setCustomers((previous) => [...previous, ...nextBatch]);
      setCustomersTruncated(Boolean(payload.truncated));
    } catch (error) {
      setLoadMoreError(error instanceof Error ? error.message : "추가 거래처를 불러오지 못했습니다.");
    } finally {
      setIsLoadingMoreCustomers(false);
    }
  };

  const selectedCustomer = customers[selectedIndex] || emptyCustomer;
  const hasCustomers = customers.length > 0;
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkManagerInput, setBulkManagerInput] = useState("");
  const [bulkManagerSubmitting, setBulkManagerSubmitting] = useState(false);
  const [bulkManagerMessage, setBulkManagerMessage] = useState("");

  function toggleBulkSelected(customerId: string) {
    setBulkSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  async function applyBulkManager() {
    if (!bulkSelectedIds.size || !bulkManagerInput.trim() || bulkManagerSubmitting) return;
    setBulkManagerSubmitting(true);
    setBulkManagerMessage("");

    try {
      const customerIds = Array.from(bulkSelectedIds);
      const response = await fetch("/api/customers/bulk-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: getAdminCompanyIdFromUrl(), customerIds, deliveryManager: bulkManagerInput })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "일괄 변경에 실패했습니다.");

      const nextManager = bulkManagerInput.trim();
      setCustomers((previous) => previous.map((customer) => (customer.id && bulkSelectedIds.has(customer.id) ? { ...customer, deliveryManager: nextManager } : customer)));
      setBulkManagerMessage(`${customerIds.length.toLocaleString()}곳의 담당자를 "${nextManager}"(으)로 변경했습니다.`);
      setBulkSelectedIds(new Set());
      setBulkManagerInput("");
    } catch (error) {
      setBulkManagerMessage(error instanceof Error ? error.message : "일괄 변경에 실패했습니다.");
    } finally {
      setBulkManagerSubmitting(false);
    }
  }
  const [draftCustomer, setDraftCustomer] = useState<CustomerView | null>(null);
  const [customerAttachments, setCustomerAttachments] = useState<CustomerAttachmentView[]>([]);
  const [customerNotes, setCustomerNotes] = useState<CustomerNoteView[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newMemo, setNewMemo] = useState("");
  const [newNextAction, setNewNextAction] = useState("");
  const [newAttachmentTitle, setNewAttachmentTitle] = useState("배송 적재위치 사진/영상");
  const [newAttachmentType, setNewAttachmentType] = useState("loading_position");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [addressSearchMessage, setAddressSearchMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isAddressSearching, setIsAddressSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBusinessStatusChecking, setIsBusinessStatusChecking] = useState(false);
  const [businessStatusMessage, setBusinessStatusMessage] = useState("");
  const [isBulkBusinessStatusChecking, setIsBulkBusinessStatusChecking] = useState(false);
  const [bulkBusinessStatusMessage, setBulkBusinessStatusMessage] = useState("");
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [isAttachmentSaving, setIsAttachmentSaving] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [detailTab, setDetailTab] = useState<CustomerDetailTab>("ledger");
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const businessNumberInputRef = useRef<HTMLInputElement | null>(null);
  const deliveryManagerInputRef = useRef<HTMLInputElement | null>(null);
  const loadingPositionInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftCustomer(selectedCustomer ? { ...selectedCustomer } : null);
    // 거래처를 선택하면 곧바로 편집 가능한 상태로 엽니다 (거래처 관리 = 조회가 아니라 수정이 기본 동작).
    setIsEditing(hasCustomers);
    setSaveMessage("");
    setNewMemo("");
    setNewNextAction("");
    setNewAttachmentTitle("배송 적재위치 사진/영상");
    setNewAttachmentType("loading_position");
    setNewAttachmentUrl("");
    setNewAttachmentFiles([]);
    setAttachmentMessage("");
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
    syncSelectedCustomerUrl(selectedCustomer.id);
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
  const hasOperationalLedger = customerSource === "supabase";
  const ledgerStatusLabel =
    customerSource === "loading"
      ? "원장 확인 중"
      : hasOperationalLedger
        ? "DB 거래처 원장 연결"
        : "DB 거래처 원장 미연결";
  const ledgerStatusDescription = hasOperationalLedger
    ? "Supabase 거래처 원장 기준으로 목록과 상세를 표시합니다."
    : "데이터 등록에서 거래처 마스터를 저장하면 이 화면에 실제 원장이 표시됩니다.";
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
  const businessStatusCheckableCount = Math.max(0, customers.length - businessNumberMissingCount);
  const businessStatusReadyCount = customers.filter((customer) => customer.businessStatus === "정상").length;
  const loadingMissingCount = customers.filter((customer) => !customer.loadingPosition).length;
  const contactMissingCount = customers.filter((customer) => !customer.phone || !customer.representativeName).length;
  const managerMissingCount = customers.filter((customer) => !customer.deliveryManager).length;
  const selectedFilteredArrayIndex = filteredCustomers.findIndex(({ index }) => index === selectedIndex);
  const selectedFilteredPosition = selectedFilteredArrayIndex + 1;
  const previousFilteredCustomer = selectedFilteredArrayIndex > 0 ? filteredCustomers[selectedFilteredArrayIndex - 1] : null;
  const nextFilteredCustomer = selectedFilteredArrayIndex >= 0 && selectedFilteredArrayIndex < filteredCustomers.length - 1 ? filteredCustomers[selectedFilteredArrayIndex + 1] : null;
  const [mergingCustomerId, setMergingCustomerId] = useState("");
  const [mergeMessage, setMergeMessage] = useState("");
  const duplicateCandidates = useMemo(() => {
    if (!selectedCustomer.customerName?.trim()) return [];
    const key = selectedCustomer.customerName.trim().replace(/\s+/g, "").toLowerCase();
    return customers.filter(
      (customer) => customer.id !== selectedCustomer.id && customer.customerName.trim().replace(/\s+/g, "").toLowerCase() === key
    );
  }, [customers, selectedCustomer.customerName, selectedCustomer.id]);

  function jumpToCustomer(customerId: string | undefined) {
    if (!customerId) return;
    const targetIndex = customers.findIndex((customer) => customer.id === customerId);
    if (targetIndex >= 0) setSelectedIndex(targetIndex);
  }

  async function mergeDuplicateIntoSelected(duplicateId: string, duplicateLabel: string) {
    if (!selectedCustomer.id || mergingCustomerId) return;
    const confirmed = window.confirm(
      `"${duplicateLabel}" 레코드를 "${selectedCustomer.customerName}"(으)로 병합합니다.\n매출 이력·메모·첨부는 이 거래처로 옮겨지고, "${duplicateLabel}" 레코드는 완전히 삭제됩니다. 되돌릴 수 없습니다. 계속할까요?`
    );
    if (!confirmed) return;

    setMergingCustomerId(duplicateId);
    setMergeMessage("");
    try {
      const response = await fetch("/api/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: getAdminCompanyIdFromUrl(), primaryCustomerId: selectedCustomer.id, duplicateCustomerIds: [duplicateId] })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "병합에 실패했습니다.");

      const primaryId = selectedCustomer.id;
      setCustomers((previous) => {
        const next = previous.filter((customer) => customer.id !== duplicateId);
        const nextSelectedIndex = next.findIndex((customer) => customer.id === primaryId);
        if (nextSelectedIndex >= 0) setSelectedIndex(nextSelectedIndex);
        return next;
      });
      setMergeMessage(`병합 완료: 매출 ${payload.movedTransactions}건, 메모 ${payload.movedNotes}건, 첨부 ${payload.movedAttachments}건을 옮기고 중복 레코드를 삭제했습니다.`);
    } catch (error) {
      setMergeMessage(error instanceof Error ? error.message : "병합에 실패했습니다.");
    } finally {
      setMergingCustomerId("");
    }
  }
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
      description: customerNotes.length ? "최근 메모가 DB 이력으로 관리됩니다." : `${selectedCustomer.memoCount}건 기준 이력이 표시됩니다.`,
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
    recentMemoAt: latestNote?.createdAt || "DB 이력 대기",
    visitCount: selectedCustomer.visitCount
  };
  const draftBusinessNumberChanged = Boolean(
    draftCustomer &&
      normalizeBusinessRegistrationNumber(draftCustomer.businessNumber || "") !== normalizeBusinessRegistrationNumber(selectedCustomer.businessNumber || "")
  );
  const draftBusinessNumberValid = !draftCustomer?.businessNumber || isValidBusinessRegistrationNumber(draftCustomer.businessNumber || "");
  const canSaveCustomer = !isSaving && (!draftBusinessNumberChanged || draftBusinessNumberValid);

  function applyOperationFilter(nextFilter: OperationFilter) {
    const resolvedFilter = operationFilter === nextFilter ? "all" : nextFilter;
    if (resolvedFilter === "all") {
      clearOperationFilter();
      return;
    }

    setOperationFilter(resolvedFilter);
    syncOperationFilterUrl(resolvedFilter);

    const nextIndex = customers.findIndex((customer) => customerMatchesOperationFilter(customer, resolvedFilter));
    if (nextIndex >= 0) setSelectedIndex(nextIndex);
  }

  function clearOperationFilter() {
    setOperationFilter("all");
    syncOperationFilterUrl("all");
    setSelectedIndex(0);
    setIsEditing(false);
    setSaveMessage("");
    setCustomerSearch("");
  }

  function moveFilteredSelection(direction: "next" | "previous") {
    const target = direction === "next" ? nextFilteredCustomer : previousFilteredCustomer;
    if (!target) return;
    setSelectedIndex(target.index);
    setIsEditing(false);
    setSaveMessage("");
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
          businessNumber: formatBusinessRegistrationNumber(draftCustomer.businessNumber || ""),
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
      const completedCleanupFilter = shouldMoveToNext && !movedToNext;

      setCustomers(nextCustomers);
      if (movedToNext) setSelectedIndex(nextIndex);
      if (completedCleanupFilter) {
        setOperationFilter("all");
        syncOperationFilterUrl("all");
        setSelectedIndex(0);
      }
      setDraftCustomer(movedToNext ? nextCustomers[nextIndex] : saved);
      setIsEditing(!movedToNext && !completedCleanupFilter && operationFilter !== "all");
      setSaveMessage(
        payload?.persisted === false
          ? "거래처 정보가 화면에 반영되었습니다. DB 저장 상태는 관리자 시스템 점검에서 확인하세요."
          : movedToNext
            ? "저장되었습니다. 같은 보완 조건의 다음 거래처로 이동했습니다."
            : completedCleanupFilter
              ? "저장되었습니다. 현재 보완 필터의 남은 거래처가 없어 전체 목록으로 돌아갑니다."
            : "거래처 정보가 DB에 저장되었습니다."
      );
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshSelectedCustomerBusinessStatus() {
    if (!selectedCustomer?.id) return;
    setIsBusinessStatusChecking(true);
    setBusinessStatusMessage("");

    try {
      const response = await fetch("/api/customer/business-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: getAdminCompanyIdFromUrl(), customerIds: [selectedCustomer.id] })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "사업자 상태 조회에 실패했습니다.");

      if (payload?.configured === false) {
        setBusinessStatusMessage("사업자 상태 자동조회 API 키가 아직 설정되지 않았습니다.");
        return;
      }
      if (!payload?.updated) {
        setBusinessStatusMessage("사업자번호가 없어 상태를 조회할 수 없습니다.");
        return;
      }

      const refreshed = await fetch(withCompanyQuery("/api/customers"), { cache: "no-store" });
      const refreshedPayload = await refreshed.json().catch(() => null);
      const nextCustomer = Array.isArray(refreshedPayload?.customers)
        ? refreshedPayload.customers.find((customer: CustomerView) => customer.id === selectedCustomer.id)
        : null;

      if (nextCustomer) {
        setCustomers((current) => current.map((customer) => (customer.id === selectedCustomer.id ? nextCustomer : customer)));
        setBusinessStatusMessage(`최신 사업자 상태: ${nextCustomer.businessStatus || "확인 필요"}`);
      } else {
        setBusinessStatusMessage("사업자 상태를 갱신했습니다. 목록을 새로고침하세요.");
      }
    } catch (error) {
      setBusinessStatusMessage(error instanceof Error ? error.message : "사업자 상태 조회 중 오류가 발생했습니다.");
    } finally {
      setIsBusinessStatusChecking(false);
    }
  }

  async function refreshAllBusinessStatuses() {
    setIsBulkBusinessStatusChecking(true);
    setBulkBusinessStatusMessage("");

    try {
      const response = await fetch("/api/customer/business-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: getAdminCompanyIdFromUrl() })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "사업자 상태 일괄 조회에 실패했습니다.");

      if (payload?.configured === false) {
        setBulkBusinessStatusMessage("사업자 상태 자동조회 API 키가 아직 설정되지 않았습니다.");
        return;
      }

      const closedCount = Array.isArray(payload?.closed) ? payload.closed.length : 0;
      setBulkBusinessStatusMessage(
        `${payload?.checked || 0}곳 조회, ${payload?.updated || 0}곳 갱신${closedCount ? ` · 폐업 확인 ${closedCount}곳` : ""}${
          payload?.skippedNoBusinessNumber ? ` · 사업자번호 없음 ${payload.skippedNoBusinessNumber}곳 제외` : ""
        }`
      );

      const refreshed = await fetch(withCompanyQuery("/api/customers"), { cache: "no-store" });
      const refreshedPayload = await refreshed.json().catch(() => null);
      if (Array.isArray(refreshedPayload?.customers)) {
        setCustomers(refreshedPayload.customers);
      }
    } catch (error) {
      setBulkBusinessStatusMessage(error instanceof Error ? error.message : "사업자 상태 일괄 조회 중 오류가 발생했습니다.");
    } finally {
      setIsBulkBusinessStatusChecking(false);
    }
  }

  async function saveNote() {
    if (!selectedCustomer?.id || !newMemo.trim()) return;
    setIsNoteSaving(true);
    setNoteMessage("");

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
      if (payload?.note) {
        setCustomerNotes((current) => [payload.note, ...current]);
        setTimeline((current) => [
          {
            id: `note-${payload.note.id}`,
            expectedRevenue: selectedCustomer.monthlyRevenue || 0,
            leadName: selectedCustomer.customerName,
            memo: payload.note.memo,
            nextAction: payload.note.nextAction || "",
            region: selectedCustomer.region,
            result: "memo",
            visitedAt: payload.note.createdAt
          },
          ...current
        ]);
        setTimelineSource("supabase");
      }
      setNewMemo("");
      setNewNextAction("");
    } catch (error) {
      setNoteMessage(error instanceof Error ? error.message : "메모 저장 중 오류가 발생했습니다.");
    } finally {
      setIsNoteSaving(false);
    }
  }

  async function saveAttachment() {
    if (!selectedCustomer?.id || !newAttachmentTitle.trim()) return;
    setIsAttachmentSaving(true);
    setAttachmentMessage("");

    try {
      const uploadedAttachments: CustomerAttachmentView[] = [];
      let hasTemporaryResult = false;

      if (newAttachmentFiles.length) {
        for (let index = 0; index < newAttachmentFiles.length; index += 1) {
          const file = newAttachmentFiles[index];
          const formData = new FormData();
          formData.append("attachmentType", newAttachmentType);
          formData.append("companyId", getAdminCompanyIdFromUrl());
          formData.append("customerId", selectedCustomer.id);
          formData.append("file", file);
          formData.append("title", newAttachmentFiles.length > 1 ? `${newAttachmentTitle} ${index + 1}` : newAttachmentTitle);
          const response = await fetch("/api/customer-attachments/upload", {
            method: "POST",
            body: formData
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.message || `${file.name} 첨부자료 저장에 실패했습니다.`);
          if (payload?.attachment) uploadedAttachments.push(payload.attachment);
          if (payload?.uploaded === false || payload?.persisted === false) hasTemporaryResult = true;
        }
      } else {
        const response = await fetch("/api/customer-operations", {
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
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "첨부자료 저장에 실패했습니다.");
        if (payload?.attachment) uploadedAttachments.push(payload.attachment);
        if (payload?.uploaded === false || payload?.persisted === false) hasTemporaryResult = true;
      }

      if (uploadedAttachments.length) setCustomerAttachments((current) => [...uploadedAttachments, ...current]);
      setAttachmentMessage(
        hasTemporaryResult
          ? `${uploadedAttachments.length || 1}건이 화면에 임시 반영됐습니다. 실제 파일 저장은 Supabase Storage 설정을 확인해야 합니다.`
          : `${uploadedAttachments.length || 1}건의 첨부자료가 거래처 원장에 저장됐습니다.`
      );
      setNewAttachmentTitle(attachmentTitleFromType(newAttachmentType));
      setNewAttachmentUrl("");
      setNewAttachmentFiles([]);
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : "첨부자료 저장 중 오류가 발생했습니다.");
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
      subtitle="등록된 거래처를 검색해 상세 정보와 운영 상태를 바로 수정합니다."
      title="거래처 관리"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <section className="mx-auto grid max-w-[1560px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-24 xl:self-start">
          <WorkspaceSectionNav
            items={[
              { active: true, badge: hasOperationalLedger ? "DB" : "필요", description: "전체 거래처, 등급, 보완 상태를 먼저 확인합니다.", href: "#customer-ledger-summary", icon: Building2, label: "전체 현황" },
              { description: "검색, 등급, 사업자·주소·적재위치 보완 필터입니다.", href: "#customer-ledger-list", icon: Search, label: "거래처 검색·필터" },
              { description: "선택 거래처의 사업자정보와 배송 기준값을 바로 수정합니다.", href: "#customer-ledger-detail", icon: Pencil, label: "거래처 편집" },
              { description: "상담 메모, 방문 기록, 첨부자료를 누적합니다.", href: "#customer-ledger-history", icon: FileText, label: "메모·첨부" }
            ]}
            title="거래처 관리"
          />
        </div>

        <div className="min-w-0 space-y-4">
        <div className="maju-section-card scroll-mt-28" id="customer-ledger-summary">
          <SectionHeader
            eyebrow="지도 작업공간"
            title="거래처 전체 현황"
            description="지도 홈이 사용하는 거래처 기준값입니다. 개별 거래처 수정은 아래 검색 후 상세 편집에서 진행합니다."
          />
          <div className="p-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[150px_repeat(4,minmax(0,1fr))]">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-1">
                  <p className="maju-muted-label">원장 상태</p>
                  <InfoTooltip size="sm" text={ledgerStatusDescription} tone={hasOperationalLedger ? "emerald" : "amber"} />
                </div>
                <Badge className={`mt-1.5 ${hasOperationalLedger ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{ledgerStatusLabel}</Badge>
                <p className="mt-1 truncate text-[10px] font-bold text-slate-500">{dbSummary.label}</p>
              </div>
              <SummaryCard helper={hasOperationalLedger ? `정제 ${formatDbCount(dbSummary.normalizedCustomers)}` : "거래처 마스터 등록 필요"} label="전체 거래처" value={hasOperationalLedger ? `${customers.length}곳` : "등록 필요"} />
              <SummaryCard helper="매출 기준 우수 거래처" label="A등급" value={`${customers.filter((customer) => customer.grade === "A").length}곳`} tone="emerald" />
              <SummaryCard helper="검색·필터 적용 결과" label="현재 목록" value={`${filteredCustomers.length}곳`} tone="blue" />
              <SummaryCard helper={hasOperationalLedger ? `방문 결과 ${formatDbCount(dbSummary.visitResults)}` : "방문 기록 등록 후 집계"} label="예상매출" value={hasOperationalLedger ? `${expectedRevenue.toLocaleString()}만원` : "등록 후"} tone="violet" />
            </div>
            {dbError ? <p className="mt-2 rounded-md bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">DB/API 확인 메시지: {dbError}</p> : null}
            {!hasCustomers ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-900">
                  {customerSource === "loading" ? "거래처 원장을 불러오는 중입니다." : "실제 거래처 원장 데이터가 아직 연결되지 않았습니다."}
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-amber-800">
                  데이터 등록에서 거래처 마스터를 저장하면 지도 홈과 거래처 원장이 같은 DB 기준으로 연결됩니다.
                </p>
                <Link className="maju-button-primary mt-3" href={withCompanyQuery("/?type=customer-master")}>
                  거래처 마스터 등록하기
                </Link>
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

        <div className="maju-section-card scroll-mt-28">
          <SectionHeader eyebrow="거래처 작업" title="거래처 운영 현황" description="사업자 상태, 연락처, 배송주소, 적재위치 기준으로 원장 완성도를 확인하고 부족한 데이터를 보완합니다." />
          <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-sm font-black text-slate-900">보완이 필요한 거래처를 먼저 정리하세요</p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <MiniLedgerMetric label="운영 가능" value={`${readyCustomerCount.toLocaleString()}곳`} tone="ready" />
                <MiniLedgerMetric label="보완 필요" value={`${needsAttentionCustomers.length.toLocaleString()}곳`} tone="warning" />
              </div>
            </div>
            <Link className="flex items-center justify-between rounded-lg border border-teal-700 bg-teal-700 p-3 text-white shadow-sm transition hover:bg-teal-800" href={withCompanyQuery("/")}>
              <span>
                <span className="block text-sm font-black">거래처 데이터 보완</span>
                <span className="mt-1 block text-xs font-bold text-slate-300">엑셀/수기로 기준값 업데이트</span>
              </span>
              <Plus className="h-5 w-5 shrink-0" />
            </Link>
          </div>
        </div>

        <div className="maju-section-card scroll-mt-28" id="customer-ledger-list">
          <SectionHeader
            eyebrow="거래처 작업"
            title="거래처 목록"
            description="검색과 필터로 거래처를 찾고, 선택한 거래처의 원장을 오른쪽에서 관리합니다."
          />
          {/*
            검색·필터 사이드바(360~400px)가 거래처 상세(원장/첨부자료) 그리드 옆에 항상 펼쳐져 있으면,
            상세 쪽에 실제로 남는 폭이 좁아져 안의 정보가 눌려 보였습니다. 거래처를 고르면 목록을
            자동으로 접어서 상세가 전체 폭을 쓰게 하고, 필요할 때만 다시 펼치도록 했습니다.
          */}
          <div className={`grid gap-4 border-t border-slate-200/80 bg-slate-50/50 p-4 ${customerListGridColsClassName(listCollapsed)}`}>
            {listCollapsed ? (
              <button
                aria-label="거래처 검색·목록 펼치기"
                className="maju-section-card flex items-center gap-2 px-3 py-3 text-left transition hover:bg-slate-50 xl:sticky xl:top-4 xl:flex-col xl:items-start xl:gap-3"
                onClick={() => setListCollapsed(false)}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-black text-slate-950">
                  <PanelLeftOpen className="h-4 w-4 text-slate-500" />
                  거래처 검색·목록
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {selectedCustomer.customerName} 선택됨 · {filteredCustomers.length}/{customers.length}곳
                </span>
              </button>
            ) : (
            <aside className="maju-section-card xl:sticky xl:top-4 xl:max-h-[calc(100vh-120px)]">
              <div className="border-b border-slate-200/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-950">거래처 검색·필터</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">검색 · 등급 · 보완 필요 항목</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700">{filteredCustomers.length}/{customers.length}곳</Badge>
                    <button
                      aria-label="거래처 검색·목록 접기"
                      className="maju-button-secondary h-8 w-8 px-0"
                      onClick={() => setListCollapsed(true)}
                      type="button"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="border-b border-slate-200/80 bg-slate-50/70 p-3">
                <p className="maju-muted-label px-0.5 pb-1.5">검색</p>
                <label className="maju-search-field">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="상호명, 주소, 사업자번호 검색"
                    value={customerSearch}
                  />
                </label>
                <div className="mt-3 border-t border-slate-200/80 pt-3">
                  <p className="maju-muted-label px-0.5 pb-1.5">필터</p>
                  <div className="maju-filter-box">
                    <p className="maju-muted-label px-2 pb-1">매출 등급</p>
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
                  <div className="maju-filter-box mt-3">
                    <p className="maju-muted-label px-2 pb-1">운영 상태</p>
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
                        onClick={clearOperationFilter}
                      />
                    </div>
                  </div>
                </div>
                <BusinessStatusControlPanel
                  checkableCount={businessStatusCheckableCount}
                  isChecking={isBulkBusinessStatusChecking}
                  message={bulkBusinessStatusMessage}
                  missingNumberCount={businessNumberMissingCount}
                  needsCheckCount={businessCheckCount}
                  onRefresh={refreshAllBusinessStatuses}
                  readyCount={businessStatusReadyCount}
                />
              <CleanupWorkStatus
                filterLabel={activeCleanupLabel}
                filteredCount={filteredCustomers.length}
                isActive={operationFilter !== "all"}
                onClear={clearOperationFilter}
                selectedPosition={selectedFilteredPosition}
              />
              <LedgerListStatusStrip
                customerSource={customerSource}
                gradeFilter={gradeFilter}
                hasCustomers={hasCustomers}
                operationFilter={operationFilter}
                query={customerSearch}
                visibleCount={filteredCustomers.length}
                totalCount={customers.length}
              />
            </div>
            {bulkSelectedIds.size ? (
              <div className="space-y-1.5 border-b border-teal-100 bg-teal-50/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-teal-900">{bulkSelectedIds.size.toLocaleString()}곳 선택됨</span>
                  <input
                    className="h-8 min-w-0 flex-1 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold outline-none focus:border-teal-400"
                    onChange={(event) => setBulkManagerInput(event.target.value)}
                    placeholder="새 담당자명"
                    value={bulkManagerInput}
                  />
                  <button
                    className="maju-button-secondary h-8 shrink-0 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!bulkManagerInput.trim() || bulkManagerSubmitting}
                    onClick={() => void applyBulkManager()}
                    type="button"
                  >
                    {bulkManagerSubmitting ? "변경 중..." : "일괄 변경"}
                  </button>
                  <button className="h-8 shrink-0 px-2 text-xs font-bold text-teal-700 hover:underline" onClick={() => setBulkSelectedIds(new Set())} type="button">
                    선택 해제
                  </button>
                </div>
                {bulkManagerMessage ? <p className="text-[11px] font-bold text-teal-800">{bulkManagerMessage}</p> : null}
              </div>
            ) : null}
            <div className="max-h-[560px] space-y-2 overflow-auto p-3 xl:max-h-[calc(100vh-520px)] xl:min-h-[360px]">
              {filteredCustomers.map(({ customer, index }) => {
                const issues = customerOperationalIssues(customer);
                const readyScore = Math.round(((4 - issues.length) / 4) * 100);
                return (
                  <div
                    key={`${customer.customerName}-${customer.address}`}
                    className={`flex w-full gap-2 rounded-md border p-3 transition ${
                      index === selectedIndex ? "border-slate-900 bg-slate-50 shadow-sm ring-1 ring-slate-900/5" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {customer.id ? (
                      <input
                        aria-label={`${customer.customerName} 일괄 선택`}
                        checked={bulkSelectedIds.has(customer.id)}
                        className="mt-1 h-3.5 w-3.5 shrink-0"
                        onChange={() => toggleBulkSelected(customer.id as string)}
                        type="checkbox"
                      />
                    ) : null}
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setSelectedIndex(index);
                        setListCollapsed(true);
                      }}
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
                  </div>
                );
              })}
              {!filteredCustomers.length ? (
                <div className="maju-empty-state">
                  <p className="text-sm font-black text-slate-700">{hasCustomers ? "조건에 맞는 거래처가 없습니다." : "등록된 거래처가 없습니다."}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {hasCustomers ? "검색어, 등급 또는 운영 필터를 바꿔보세요." : "거래처 마스터를 업로드하거나 수기로 등록하면 이곳에 표시됩니다."}
                  </p>
                </div>
              ) : null}
              {customersTruncated ? (
                <div className="space-y-1.5 pt-1">
                  <button
                    className="maju-button-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoadingMoreCustomers}
                    onClick={() => void loadMoreCustomers()}
                    type="button"
                  >
                    {isLoadingMoreCustomers ? "불러오는 중..." : `${customers.length.toLocaleString()}곳 표시됨 · 더 불러오기`}
                  </button>
                  {loadMoreError ? <p className="text-center text-xs font-bold text-rose-600">{loadMoreError}</p> : null}
                </div>
              ) : null}
            </div>
          </aside>
            )}

          <div className="min-w-0 space-y-4">
            <div className="maju-section-card scroll-mt-28 p-4" id="customer-ledger-detail">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <Badge className="mb-3 bg-slate-100 text-slate-700">선택 거래처</Badge>
                  <h2 className="truncate text-[26px] font-black leading-tight text-slate-950">{selectedCustomer.customerName}</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    {selectedCustomer.deliveryManager} · {selectedCustomer.region} · {selectedCustomer.address}
                  </p>
                  {duplicateCandidates.length ? (
                    <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-xs font-black text-rose-900">
                        같은 상호명의 다른 레코드가 {duplicateCandidates.length}개 있습니다. 중복이면 이 거래처로 병합하거나 이동해서 비교하세요.
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {duplicateCandidates.map((customer) => (
                          <div className="flex items-center gap-1" key={customer.id}>
                            <button
                              className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100"
                              onClick={() => jumpToCustomer(customer.id)}
                              type="button"
                            >
                              {customer.address || "주소 없음"} 보기
                            </button>
                            {customer.id ? (
                              <button
                                className="rounded border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-900 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={mergingCustomerId === customer.id}
                                onClick={() => void mergeDuplicateIntoSelected(customer.id as string, customer.address || customer.customerName)}
                                type="button"
                              >
                                {mergingCustomerId === customer.id ? "병합 중..." : "이 거래처로 병합"}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {mergeMessage ? <p className="mt-1.5 text-[11px] font-bold text-rose-900">{mergeMessage}</p> : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-slate-200 bg-white text-xs font-black text-slate-700">
                    <button
                      aria-label="이전 거래처"
                      className="grid h-full w-8 place-items-center border-r border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      disabled={!previousFilteredCustomer}
                      onClick={() => moveFilteredSelection("previous")}
                      type="button"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-[72px] px-2 text-center">
                      {filteredCustomers.length ? `${selectedFilteredPosition}/${filteredCustomers.length}` : "0/0"}
                    </span>
                    <button
                      aria-label="다음 거래처"
                      className="grid h-full w-8 place-items-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      disabled={!nextFilteredCustomer}
                      onClick={() => moveFilteredSelection("next")}
                      type="button"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <Badge className={gradeClassName(selectedCustomer.grade)}>매출 {selectedCustomer.grade}등급</Badge>
                  <Badge className={selectedCustomer.businessStatus === "정상" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                    사업자 {selectedCustomer.businessStatus || "미확인"}
                  </Badge>
                  <button
                    className="maju-button-secondary h-8 hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isBusinessStatusChecking || !selectedCustomer.businessNumber}
                    onClick={refreshSelectedCustomerBusinessStatus}
                    title={selectedCustomer.businessNumber ? "국세청 사업자 상태 조회" : "사업자번호 등록 후 조회 가능"}
                    type="button"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isBusinessStatusChecking ? "animate-spin" : ""}`} />
                    {isBusinessStatusChecking ? "조회 중" : "사업자 상태 조회"}
                  </button>
                  <Link
                    className="maju-button-secondary h-8 hover:border-emerald-300 hover:bg-emerald-50"
                    href={withCompanyQuery("/dashboard")}
                  >
                    <Route className="h-3.5 w-3.5" />
                    코스 보기
                  </Link>
                  <button
                    className="maju-button-secondary h-8 hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => setIsEditing((value) => !value)}
                    type="button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {isEditing ? "보기" : "편집"}
                  </button>
                </div>
              </div>
              {businessStatusMessage ? (
                <p
                  className={`mt-2 rounded-md p-2 text-xs font-bold ${
                    businessStatusMessage.includes("실패") || businessStatusMessage.includes("오류") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {businessStatusMessage}
                </p>
              ) : null}

              <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
                  <InfoTile icon={Building2} label="사업자번호" value={selectedCustomer.businessNumber || "미등록"} />
                  <InfoTile icon={Phone} label="연락처" value={selectedCustomer.phone || "미등록"} />
                  <InfoTile icon={Banknote} label="월 매출" value={`${selectedCustomer.monthlyRevenue.toLocaleString()}만원`} />
                  <InfoTile icon={Route} label="출발지 거리" value={`${selectedCustomer.deliveryKm}km`} />
                </div>
                <div className="grid gap-0 border-t border-slate-200 sm:grid-cols-3">
                  <PriorityTile label="배송 적재위치" value={selectedCustomer.loadingPosition || "미등록"} helper={`${loadingPositionAttachments}개 자료 등록`} tone="blue" />
                  <PriorityTile label="히스토리 메모" value={`${customerNotes.length || selectedCustomer.memoCount}건`} helper="상담·배송 특이사항" tone="slate" />
                  <PriorityTile label="담당 배송자" value={selectedCustomer.deliveryManager || "미지정"} helper={`${selectedCustomer.region || "미분류"} 권역`} tone="emerald" />
                </div>
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
              <details className="maju-section-card mt-4 overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block text-sm font-black text-slate-950">현장 기록 상세</span>
                    <span className="mt-0.5 block text-xs font-bold text-slate-500">첨부자료, 배송완료 증빙 등 모바일 현장 기록 건수는 필요할 때 펼쳐서 확인합니다.</span>
                  </span>
                  <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">
                    메모 {fieldRecordSummary.memoCount.toLocaleString()} · 첨부 {fieldRecordSummary.attachmentCount.toLocaleString()}
                  </Badge>
                </summary>
                <div className="border-t border-slate-200 bg-slate-50/60 p-3">
                  <FieldRecordTracePanel
                    summary={fieldRecordSummary}
                    onOpenHistory={() => setDetailTab("history")}
                    onOpenLedger={() => setDetailTab("ledger")}
                  />
                </div>
              </details>
            </div>

            <div className="maju-section-card scroll-mt-28" id="customer-ledger-history">
              <div className="maju-card-header flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="maju-muted-label">거래처 상세 탭</p>
                  <p className="mt-1 truncate text-sm font-black text-slate-950">{customerDetailTabs.find((tab) => tab.id === detailTab)?.description}</p>
                </div>
                <div className="grid w-full gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_0_rgba(15,23,42,0.03)] sm:w-auto sm:grid-cols-2">
                  {customerDetailTabs.map((tab) => {
                    const Icon = tab.icon;
                    const selected = detailTab === tab.id;
                    return (
                      <button
                        className={`group relative min-w-[170px] overflow-hidden rounded-lg border px-3 py-3 text-left transition ${
                          selected
                            ? "border-teal-700 bg-teal-700 text-white shadow-[0_10px_22px_rgba(15,118,110,0.18)]"
                            : "border-slate-200 bg-white text-slate-600 shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800"
                        }`}
                        key={tab.id}
                        onClick={() => setDetailTab(tab.id)}
                        type="button"
                      >
                        {selected ? <span className="absolute inset-x-0 top-0 h-1 bg-white/80" /> : null}
                        <span className="flex items-center gap-2 text-sm font-black">
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${selected ? "bg-white/15" : "bg-slate-100 group-hover:bg-white"}`}>
                            <Icon className={`h-4 w-4 ${selected ? "text-white" : "text-slate-400 group-hover:text-teal-700"}`} />
                          </span>
                          {tab.label}
                        </span>
                        <span className={`mt-2 block truncate text-[11px] font-bold ${selected ? "text-white/75" : "text-slate-400 group-hover:text-teal-600"}`}>{tab.shortLabel}</span>
                        <span className={`mt-1 block truncate text-[10px] font-black ${selected ? "text-white/60" : "text-slate-500"}`}>{tab.helper}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/*
              이 그리드는 좌측 260px 내비게이션 + 260px 거래처 목록 사이드바 안에 중첩돼 있어서, 화면이
              2xl(1536px) 이상이어도 실제로 남는 폭은 훨씬 좁을 수 있습니다. 이전에 xl/2xl 뷰포트 기준
              고정 2단 그리드(minmax(0,1fr)_minmax(440px,0.42fr))를 썼을 때 폭이 좁아지면 왼쪽 칸이
              극단적으로 눌려 보이는 문제가 있었습니다(위 EditableField 폼과 같은 원인). 실제 남는 폭
              기준으로 칸 수가 스스로 조절되도록 auto-fit으로 바꿨습니다.
            */}
            {detailTab === "ledger" ? <div className="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-4">
              <div className="maju-section-card overflow-hidden">
                <div className="maju-card-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-600">Customer Ledger</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">기본정보 / 배송정보</h3>
                  </div>
                  {isEditing ? (
                    <button
                      className="maju-button-primary inline-flex h-9 items-center gap-2 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-300"
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
                    <div className="maju-panel border-blue-100 bg-blue-50/60 p-3">
                      <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                        <MapPin className="h-4 w-4 text-blue-700" />
                        주소 API 검색
                      </div>
                      <div className="mt-3 flex flex-col gap-2 lg:flex-row">
                        <label className="maju-search-field flex h-10 min-w-0 flex-1 items-center gap-2 px-3">
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
                          className="maju-button-secondary inline-flex h-10 items-center justify-center gap-2 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
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
                              className="maju-filter-box w-full bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50"
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
                    {/*
                      이 폼은 좌측 260px 내비게이션 + 400px 검색 사이드바 + 우측 440px 첨부자료 패널까지
                      한 화면에 3중으로 중첩된 뷰포트 기준(xl/2xl) 그리드 안에 들어있습니다. 화면 자체는
                      2xl(1536px) 이상이어도, 이 폼에 실제로 남는 폭은 그 중첩 때문에 훨씬 좁아질 수 있어서
                      "뷰포트 기준" md:grid-cols-2/2xl:grid-cols-3처럼 고정 컬럼 수를 강제하면 남은 폭이
                      좁을 때 칸이 극단적으로 눌려 보이는 문제가 있었습니다. 실제 남은 폭 기준으로
                      칸 수가 스스로 조절되도록 auto-fit으로 바꿨습니다.
                    */}
                    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-3 gap-y-3">
                      <EditableField label="상호명" value={draftCustomer.customerName} onChange={(value) => updateDraft("customerName", value)} />
                      <EditableField
                        helper={
                          draftBusinessNumberChanged
                            ? draftBusinessNumberValid
                              ? `${formatBusinessRegistrationNumber(draftCustomer.businessNumber || "")} 검증 완료`
                              : "유효하지 않은 사업자번호입니다."
                            : "기존 번호 유지"
                        }
                        helperTone={draftBusinessNumberChanged && !draftBusinessNumberValid ? "danger" : draftBusinessNumberChanged ? "success" : "muted"}
                        label="사업자번호"
                        value={draftCustomer.businessNumber || ""}
                        inputRef={businessNumberInputRef}
                        onChange={(value) => updateDraft("businessNumber", formatBusinessNumberInput(value))}
                      />
                      <EditableField label="대표자명" value={draftCustomer.representativeName || ""} onChange={(value) => updateDraft("representativeName", value)} />
                      <EditableField
                        label="연락처"
                        value={draftCustomer.phone || ""}
                        inputRef={phoneInputRef}
                        onChange={(value) => updateDraft("phone", formatPhoneNumberInput(value))}
                      />
                      <EditableField label="이메일" value={draftCustomer.email || ""} onChange={(value) => updateDraft("email", value)} />
                      <EditableField label="업종" value={draftCustomer.industry} onChange={(value) => updateDraft("industry", value)} />
                      <EditableField label="지역" value={draftCustomer.region} onChange={(value) => updateDraft("region", value)} />
                      <EditableField label="월 매출(만원)" value={String(draftCustomer.monthlyRevenue)} onChange={(value) => updateDraft("monthlyRevenue", value)} />
                      <EditableField label="배송담당자" value={draftCustomer.deliveryManager || ""} inputRef={deliveryManagerInputRef} onChange={(value) => updateDraft("deliveryManager", value)} />
                      <EditableField label="출발지 거리(km)" value={String(draftCustomer.deliveryKm)} onChange={(value) => updateDraft("deliveryKm", value)} />
                      <EditableField label="최근 주문일" value={String(draftCustomer.lastOrderDays)} onChange={(value) => updateDraft("lastOrderDays", value)} />
                      <EditableField label="방문횟수" value={String(draftCustomer.visitCount)} onChange={(value) => updateDraft("visitCount", value)} />
                      <EditableField className="col-span-full" label="주소" value={draftCustomer.address} onChange={(value) => updateDraft("address", value)} />
                      <EditableField className="col-span-full" label="배송 적재위치" value={draftCustomer.loadingPosition || ""} inputRef={loadingPositionInputRef} onChange={(value) => updateDraft("loadingPosition", value)} />
                      <EditableField className="col-span-full" helper="네이버 리뷰, 영업시간, 업체 상태 추적에 활용합니다." label="네이버 플레이스 링크" value={draftCustomer.naverPlaceUrl || ""} onChange={(value) => updateDraft("naverPlaceUrl", value)} />
                      <EditableField className="col-span-full" helper="카카오맵 장소 상세와 로드뷰 확인에 활용합니다." label="카카오맵 링크" value={draftCustomer.kakaoPlaceUrl || ""} onChange={(value) => updateDraft("kakaoPlaceUrl", value)} />
                      <EditableField className="col-span-full" helper="구글 리뷰와 지도 정보를 함께 확인할 때 활용합니다." label="구글맵 링크" value={draftCustomer.googleMapUrl || ""} onChange={(value) => updateDraft("googleMapUrl", value)} />
                    </div>
                  </div>
                ) : (
                  <div className="grid divide-y divide-slate-100 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
                    <div className="p-4">
                      <LedgerSectionLabel eyebrow="Business" title="사업자 정보" />
                      <DetailRow label="상호명" value={selectedCustomer.customerName} />
                      <DetailRow label="사업자번호" value={selectedCustomer.businessNumber} />
                      <DetailRow label="대표자명" value={selectedCustomer.representativeName} />
                      <DetailRow label="업종" value={selectedCustomer.industry} />
                      <DetailRow label="사업자상태" value={selectedCustomer.businessStatus} />
                    </div>
                    <div className="p-4">
                      <LedgerSectionLabel eyebrow="Operation" title="배송 / 운영 정보" />
                      <DetailRow label="지역" value={selectedCustomer.region} />
                      <DetailRow label="주소" value={selectedCustomer.address} />
                      <DetailRow label="담당자" value={selectedCustomer.deliveryManager} />
                      <DetailRow label="출발지 거리" value={`${selectedCustomer.deliveryKm}km`} />
                      <DetailRow label="최근 주문" value={`${selectedCustomer.lastOrderDays}일 전`} />
                    </div>
                    <div className="p-4 xl:col-span-2">
                      <PlaceLinksPanel customer={selectedCustomer} onEdit={() => {
                        if (hasCustomers) setIsEditing(true);
                      }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="maju-section-card overflow-hidden">
                <div className="maju-card-header px-4 py-3">
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
                  <div className="maju-section-card mt-4 overflow-hidden">
                    <div className="maju-card-header px-3 py-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">자료 추가</p>
                      <p className="mt-1 text-sm font-black text-slate-950">적재위치, 사업자등록증, 통장사본을 같은 거래처 원장에 보관합니다.</p>
                    </div>
                    <div className="grid gap-3 p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-black text-slate-500">자료 종류</span>
                          <select
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
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
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-black text-slate-500">자료명</span>
                          <input
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                            onChange={(event) => setNewAttachmentTitle(event.target.value)}
                            placeholder="예: 후문 냉장창고 앞 적재사진"
                            value={newAttachmentTitle}
                          />
                        </label>
                      </div>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-black text-slate-500">파일 링크</span>
                        <input
                          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                          onChange={(event) => setNewAttachmentUrl(event.target.value)}
                          placeholder="외부 URL이 있으면 붙여넣고, 없으면 아래에서 파일을 선택하세요."
                          value={newAttachmentUrl}
                        />
                      </label>
                      <label className="maju-panel flex min-h-24 cursor-pointer items-center gap-3 border-dashed border-blue-200 bg-blue-50/60 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-700 text-white">
                          <Plus className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-950">
                            {newAttachmentFiles.length ? `${newAttachmentFiles.length}개 파일 선택됨` : "사진·PDF·영상을 직접 선택"}
                          </span>
                          <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                            배송 적재위치는 여러 장의 사진이나 짧은 영상으로 남기면 현장 전달이 가장 정확합니다. 파일당 최대 50MB.
                          </span>
                          {newAttachmentFiles.length ? (
                            <span className="mt-2 flex flex-wrap gap-1">
                              {newAttachmentFiles.slice(0, 4).map((file) => (
                                <span className="max-w-[180px] truncate rounded-md bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-inset ring-blue-100" key={`${file.name}-${file.size}`}>
                                  {file.name}
                                </span>
                              ))}
                              {newAttachmentFiles.length > 4 ? <span className="rounded-md bg-white px-2 py-1 text-[11px] font-black text-slate-500">+{newAttachmentFiles.length - 4}</span> : null}
                            </span>
                          ) : null}
                        </span>
                        <input
                          accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/quicktime"
                          className="hidden"
                          multiple
                          onChange={(event) => setNewAttachmentFiles(Array.from(event.target.files || []))}
                          type="file"
                        />
                      </label>
                      <button
                        className="maju-button-primary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={!newAttachmentTitle.trim() || (!newAttachmentUrl.trim() && !newAttachmentFiles.length) || isAttachmentSaving}
                        onClick={saveAttachment}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        {isAttachmentSaving ? "등록 중" : "첨부자료 등록"}
                      </button>
                      {attachmentMessage ? (
                        <p className={`rounded-md border px-3 py-2 text-xs font-bold leading-5 ${
                          attachmentMessage.includes("저장됐습니다")
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : attachmentMessage.includes("임시")
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-rose-200 bg-rose-50 text-rose-800"
                        }`}>
                          {attachmentMessage}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="maju-section-card mt-4 overflow-hidden">
                    <div className="maju-card-header flex items-center justify-between gap-3 px-3 py-2">
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
                            storagePath={attachment.storagePath}
                            url={attachment.fileUrl}
                            value={attachment.createdAt}
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

            {detailTab === "history" ? <div className="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-4">
              <div className="maju-section-card overflow-hidden">
                <div className="maju-card-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                  <div className="maju-section-card mt-3 overflow-hidden">
                    <div className="maju-card-header px-3 py-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">빠른 메모</p>
                      <p className="mt-1 text-sm font-black text-slate-950">현장에서 자주 남기는 문구를 먼저 선택하고, 필요한 내용을 이어서 보완합니다.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 p-3">
                      {[
                        "대표 요청사항 확인 필요",
                        "배송 특이사항 있음",
                        "견적서 발송 예정",
                        "다음 방문 일정 조율"
                      ].map((template) => (
                        <button
                          className="maju-button-secondary px-2.5 py-1.5 text-xs"
                          key={template}
                          onClick={() => setNewMemo((current) => (current ? `${current}\n${template}` : template))}
                          type="button"
                        >
                          {template}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-3 border-t border-slate-100 p-3">
                      <label className="grid gap-1.5">
                        <span className="text-xs font-black text-slate-500">상담·배송 메모</span>
                        <textarea
                          className="min-h-24 w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-sm font-bold leading-6 text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                          onChange={(event) => setNewMemo(event.target.value)}
                          placeholder="상담 내용, 배송 특이사항, 대표 요청사항을 기록하세요."
                          value={newMemo}
                        />
                      </label>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-black text-slate-500">다음 액션</span>
                          <input
                            className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                            onChange={(event) => setNewNextAction(event.target.value)}
                            placeholder="예: 견적서 발송"
                            value={newNextAction}
                          />
                        </label>
                        <button
                          className="maju-button-primary mt-auto h-10 px-4 text-sm disabled:cursor-not-allowed disabled:bg-slate-300"
                          disabled={!newMemo.trim() || isNoteSaving}
                          onClick={saveNote}
                          type="button"
                        >
                          {isNoteSaving ? "저장 중" : "메모 저장"}
                        </button>
                      </div>
                      {noteMessage ? <p className="text-xs font-bold text-rose-600">{noteMessage}</p> : null}
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
                    <div className="maju-empty-state m-4 p-4">
                      <p className="text-sm font-black text-slate-700">아직 DB 메모가 없습니다.</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        상담 내용, 배송 특이사항, 대표 요청사항을 저장하면 이곳에 시간순으로 쌓입니다. 기존 메모 기록은 {selectedCustomer.memoCount}건입니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="maju-section-card overflow-hidden">
                <div className="maju-card-header px-4 py-3">
                  <Badge className={timelineSource === "supabase" ? "mb-2 bg-emerald-50 text-emerald-700" : "mb-2 bg-slate-100 text-slate-600"}>
                    {timelineSource === "supabase" ? "실제 기록" : "기록 대기"}
                  </Badge>
                  <h3 className="text-base font-black text-slate-950">최근 액션</h3>
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-500">메모 저장, 방문 결과, 견적 요청이 거래처 기준으로 누적됩니다.</p>
                </div>
                <div className="max-h-[620px] space-y-3 overflow-auto bg-slate-50/60 p-3 xl:max-h-[calc(100vh-360px)]">
                  {timeline.length ? (
                    timeline.map((item) => (
                      <div key={item.id} className="maju-stat-card p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{item.leadName}</p>
                            <p className="mt-1 text-xs font-bold text-slate-400">{item.visitedAt}</p>
                          </div>
                          <Badge className="bg-blue-50 text-blue-700">{resultLabels[item.result] || item.result}</Badge>
                        </div>
                        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold leading-6 text-slate-700">{item.memo || "메모 없음"}</p>
                        <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                          <p className="text-[11px] font-black uppercase tracking-wide text-blue-500">다음 액션</p>
                          <p className="mt-1 text-xs font-black leading-5 text-blue-800">{item.nextAction || "미정"}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="maju-empty-state m-4 p-4">
                      <p className="text-sm font-black text-slate-800">아직 실제 방문/액션 기록이 없습니다.</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        왼쪽 메모 히스토리에서 첫 메모를 저장하면 이 영역에 바로 표시됩니다. 방문/액션 기록은 DB에 저장된 데이터만 표시합니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div> : null}
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

function BusinessStatusControlPanel({
  checkableCount,
  isChecking,
  message,
  missingNumberCount,
  needsCheckCount,
  onRefresh,
  readyCount
}: {
  checkableCount: number;
  isChecking: boolean;
  message: string;
  missingNumberCount: number;
  needsCheckCount: number;
  onRefresh: () => void;
  readyCount: number;
}) {
  const hasIssue = needsCheckCount > 0 || missingNumberCount > 0;
  const messageIsError = message.includes("실패") || message.includes("오류") || message.includes("설정되지");

  return (
    <div className={`mt-3 overflow-hidden rounded-lg border ${hasIssue ? "border-amber-200 bg-amber-50/70" : "border-emerald-100 bg-emerald-50/70"}`}>
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,auto)] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={hasIssue ? "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200" : "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200"}>
              국세청 상태조회
            </Badge>
            <span className="text-xs font-black text-slate-500">사업자번호가 있는 거래처만 조회됩니다.</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <BusinessStatusMiniMetric label="정상" tone="emerald" value={`${readyCount.toLocaleString()}곳`} />
            <BusinessStatusMiniMetric label="확인 필요" tone={needsCheckCount ? "amber" : "slate"} value={`${needsCheckCount.toLocaleString()}곳`} />
            <BusinessStatusMiniMetric label="조회 대상" tone="blue" value={`${checkableCount.toLocaleString()}곳`} />
          </div>
          {missingNumberCount ? (
            <p className="mt-2 text-[11px] font-bold leading-5 text-amber-800">
              사업자번호 미등록 {missingNumberCount.toLocaleString()}곳은 자동조회에서 제외됩니다.
            </p>
          ) : null}
        </div>
        <button
          className="maju-button-primary h-10 w-full shrink-0 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
          disabled={isChecking || checkableCount === 0}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`} />
          {isChecking ? "조회 중" : "전체 사업자 상태 조회"}
        </button>
      </div>
      {message ? (
        <div className={`border-t px-3 py-2 text-xs font-bold ${messageIsError ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-white/70 text-emerald-700"}`}>
          {message}
        </div>
      ) : null}
    </div>
  );
}

function BusinessStatusMiniMetric({ label, tone, value }: { label: string; tone: "amber" | "blue" | "emerald" | "slate"; value: string }) {
  const className =
    tone === "emerald"
      ? "border-emerald-100 bg-white text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-white text-amber-900"
        : tone === "blue"
          ? "border-blue-100 bg-white text-blue-800"
          : "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`rounded-md border px-3 py-2 ${className}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
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
        운영 상태 필터를 선택하면 보완 대상만 모아보고, 저장 후 다음 대상으로 이동합니다.
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
          <p className="mt-1 text-[11px] font-bold text-teal-700">필터와 선택 거래처가 URL에 반영되어 새로고침해도 같은 작업 위치로 열립니다.</p>
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

function LedgerListStatusStrip({
  customerSource,
  gradeFilter,
  hasCustomers,
  operationFilter,
  query,
  totalCount,
  visibleCount
}: {
  customerSource: "loading" | "supabase" | "sample" | "error";
  gradeFilter: "all" | "A" | "B" | "C";
  hasCustomers: boolean;
  operationFilter: OperationFilter;
  query: string;
  totalCount: number;
  visibleCount: number;
}) {
  const chips = [
    query.trim() ? `검색: ${query.trim()}` : "",
    gradeFilter !== "all" ? `등급: ${gradeFilter}` : "",
    operationFilter !== "all" ? `상태: ${operationFilterLabel(operationFilter)}` : ""
  ].filter(Boolean);
  const sourceLabel =
    customerSource === "loading"
      ? "원장 불러오는 중"
      : customerSource === "supabase"
        ? "DB 거래처 원장"
        : "DB 거래처 원장 미연결";

  return (
    <div className={`mt-3 rounded-lg border px-3 py-2 ${hasCustomers ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className={`text-xs font-black ${hasCustomers ? "text-slate-700" : "text-amber-900"}`}>{sourceLabel}</p>
          <p className={`mt-1 text-[11px] font-bold leading-4 ${hasCustomers ? "text-slate-500" : "text-amber-800"}`}>
            {hasCustomers ? `현재 목록 ${visibleCount.toLocaleString()}/${totalCount.toLocaleString()}곳 표시` : "거래처 마스터 등록 후 목록, 상세, 코스가 같은 DB 기준으로 연결됩니다."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.length ? (
            chips.map((chip) => (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700" key={chip}>
                {chip}
              </span>
            ))
          ) : (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${hasCustomers ? "bg-emerald-50 text-emerald-700" : "bg-white text-amber-800"}`}>
              전체 DB 원장 기준
            </span>
          )}
        </div>
      </div>
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
    { label: "전체 DB 원장", value: `${customerCount.toLocaleString()}곳`, helper: "대시보드 거래처 기준" },
    { label: "현재 필터", value: `${filteredCount.toLocaleString()}곳`, helper: "목록·상세 표시 기준" },
    { label: "배송 담당자", value: `${managerCount.toLocaleString()}명`, helper: "지도 홈 필터" },
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
    <div className="maju-section-card mt-3 overflow-hidden bg-slate-50/70">
      <div className="maju-card-header grid gap-2 px-3 py-3 text-xs font-bold leading-5 text-slate-600 lg:grid-cols-[160px_minmax(0,1fr)] lg:items-center">
        <p className="font-black text-slate-950">거래처 기준값</p>
        <p>이 화면의 거래처 수, 배송 담당자, 적재위치, 메모 수는 지도 홈이 함께 사용하는 기준 데이터입니다.</p>
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
    <div className="overflow-hidden rounded-lg border border-teal-100 bg-gradient-to-r from-teal-50 via-white to-blue-50">
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
    <div className={`maju-stat-card bg-slate-50/70 ${wide ? "col-span-2" : ""}`}>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function MiniLedgerMetric({ label, tone, value }: { label: string; tone: "ready" | "warning"; value: string }) {
  const toneClassName = tone === "ready" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-amber-100 bg-amber-50 text-amber-800";

  return (
    <div className={`maju-stat-card min-w-32 px-4 py-3 ${toneClassName}`}>
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
    <div className="maju-stat-card p-4">
      <p className="maju-muted-label">{label}</p>
      <p className={`mt-2 truncate text-[24px] font-black leading-none ${toneClassName}`} title={value}>
        {value}
      </p>
      <p className="mt-2 truncate text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function LedgerSectionLabel({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 border-b border-slate-200 pb-2">
      <div>
        <p className="maju-muted-label">{eyebrow}</p>
        <p className="mt-0.5 text-sm font-black text-slate-950">{title}</p>
      </div>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">원장</span>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-slate-200 bg-white p-3 last:border-r-0 xl:border-b-0">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="maju-muted-label">{label}</p>
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
    blue: "bg-blue-50/80 text-blue-800",
    emerald: "bg-emerald-50/80 text-emerald-800",
    slate: "bg-slate-50/80 text-slate-800"
  }[tone];

  return (
    <div className={`min-w-0 border-r border-slate-200 p-4 last:border-r-0 ${toneClassName}`}>
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
      <div className="maju-panel border-violet-100 bg-violet-50/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-white text-violet-700 ring-1 ring-inset ring-violet-200">기록 요약</Badge>
          <Badge className="bg-violet-700 text-white">{historyCount}건</Badge>
        </div>
        <p className="mt-2 text-sm font-black text-slate-950">
          {latestNote ? "최근 메모가 DB 이력으로 관리 중입니다." : "아직 DB 메모가 없습니다."}
        </p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
          {latestNote ? latestNote.memo : "상담, 배송 특이사항, 대표 요청사항을 남기면 거래처별 히스토리로 누적됩니다."}
        </p>
      </div>
      <div className="maju-stat-card bg-white p-3">
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
  loadingPosition?: string;
  onSelectUpload: () => void;
}) {
  const ready = Boolean(loadingPosition && attachmentCount > 0);

  return (
    <div className={`maju-section-card p-4 ${ready ? "border-blue-100 bg-blue-50/80" : "border-amber-200 bg-amber-50/80"}`}>
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
          className="maju-button-primary inline-flex h-10 shrink-0 items-center justify-center gap-2 px-3 text-sm"
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
    <div className="maju-section-card mt-4 p-3">
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
            className={`maju-filter-box p-3 ${
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

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid min-h-11 grid-cols-[132px_minmax(0,1fr)] items-stretch overflow-hidden border-b border-slate-100 text-sm last:border-b-0">
      <p className="flex items-center bg-slate-50 px-3 py-2.5 font-black text-slate-500">{label}</p>
      <p className="min-w-0 break-keep px-3 py-2.5 font-black leading-6 text-slate-900">{value || "미등록"}</p>
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
    <div className="maju-section-card overflow-hidden border-teal-100">
      <div className="maju-card-header flex flex-col gap-3 border-teal-100 bg-teal-50/80 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">외부 매장 정보</p>
          <h4 className="mt-1 text-base font-black text-slate-950">네이버·카카오·구글 링크</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">리뷰, 영업시간, 휴폐업 확인, 로드뷰 확인에 사용할 기준 링크입니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={filledCount === links.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
            {filledCount}/{links.length} 등록
          </Badge>
          <Badge className={filledCount === links.length ? "bg-teal-100 text-teal-800" : "bg-white text-slate-700"}>
            {readinessLabel}
          </Badge>
          <button
            className="maju-button-secondary inline-flex h-8 items-center gap-1.5 border-teal-200 px-3 text-xs text-teal-800 hover:bg-teal-100"
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
          <div className="maju-filter-box grid gap-2 bg-slate-50 p-3 md:grid-cols-4">
            <PlaceInfoMetric helper={`${readinessPercent}%`} label="정보 갱신 상태" value={readinessLabel} />
            <PlaceInfoMetric label="마지막 확인" value={customer.placeLinksCheckedAt || "확인 전"} />
            <PlaceInfoMetric label="연결 플랫폼" value={`${filledCount}개`} />
            <PlaceInfoMetric label="우선 확인" value={filledCount < links.length ? "미등록 링크" : "리뷰·영업시간"} />
          </div>
          <div className="maju-panel bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black text-slate-500">갱신 대상 정보</p>
              <Badge className="bg-slate-100 text-slate-700">원장 보완 기준</Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {updateTargets.map((target, index) => (
                <div key={target} className="maju-filter-box flex items-center gap-2 bg-slate-50 px-3 py-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-100 text-[11px] font-black text-teal-800">{index + 1}</span>
                  <span className="text-xs font-black text-slate-700">{target}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="maju-filter-box bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-500">링크 찾기</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{nextAction}</p>
          <div className="mt-2 grid gap-2">
            {searchLinks.map((link) => (
              <a
                className="maju-button-secondary inline-flex h-8 items-center justify-between px-2.5 text-xs hover:border-teal-200 hover:bg-teal-50"
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
    <div className="maju-stat-card px-3 py-2">
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
      <div className="maju-filter-box min-h-16 bg-slate-50 px-3 py-2 text-sm">
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
    { href: `https://map.naver.com/p/search/${encodedQuery}`, label: "네이버 지도" },
    { href: `https://section.blog.naver.com/Search/Post.naver?keyword=${encodedQuery}`, label: "네이버 블로그" },
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
    <label className={`maju-filter-box block min-w-0 bg-slate-50/60 p-2 ${className}`}>
      <span className="mb-1.5 block text-xs font-black text-slate-500">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
        onChange={(event) => onChange(event.target.value)}
        ref={inputRef}
        value={value}
      />
      {helper ? <span className={`mt-1.5 block text-xs font-black ${helperClassName}`}>{helper}</span> : null}
    </label>
  );
}

function AttachmentRow({ icon: Icon, label, storagePath = "", url = "", value }: { icon: typeof PackageCheck; label: string; storagePath?: string; url?: string; value: string }) {
  const statusLabel = storagePath ? "Storage 저장" : url ? "외부 링크" : "파일 대기";
  const statusClassName = storagePath
    ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
    : url
      ? "bg-blue-50 text-blue-800 ring-blue-100"
      : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,auto)] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-black text-slate-800">{label}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${statusClassName}`}>{statusLabel}</span>
        </div>
        <p className="mt-1 text-xs font-bold text-slate-500">{value}</p>
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

// 입력 중에도 자동으로 하이픈이 붙도록 하는 실시간 포맷터입니다 (10자리 미만이어도 동작).
function formatBusinessNumberInput(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// 휴대폰(010 등, 3-4-4)과 서울/지역 번호(02는 2자리, 그 외는 3자리 지역번호)를
// 입력 자릿수에 맞춰 실시간으로 하이픈을 붙여줍니다.
function formatPhoneNumberInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
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
