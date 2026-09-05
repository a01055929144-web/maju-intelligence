"use client";

import Link from "next/link";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Banknote, Building2, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileText, LinkIcon, MapPin, PackageCheck, PanelLeftClose, PanelLeftOpen, Pencil, Phone, Plus, RefreshCw, Route, Save, Search, Store, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { LinkifiedText } from "@/components/linkified-text";
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
  bankAccountFileUrl?: string;
  businessLicenseFileUrl?: string;
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
const LIST_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

const resultLabels: Record<string, string> = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  memo: "메모 저장",
  delivery: "배송 기록",
  delivery_message: "발송 기록",
  route_action: "현장 액션",
  pending: "보류",
  failed: "실패"
};

const customerDetailTabs: Array<{ description: string; helper: string; icon: typeof Building2; id: CustomerDetailTab; label: string; shortLabel: string }> = [
  { description: "사업자정보, 배송 기준값, 첨부자료를 한 번에 관리합니다.", helper: "사업자·주소·적재위치", icon: Building2, id: "ledger", label: "거래처 원장", shortLabel: "원장" },
  { description: "상담 메모, 방문 기록, 다음 액션을 시간순으로 누적합니다.", helper: "메모·방문·다음 액션", icon: FileText, id: "history", label: "활동 기록", shortLabel: "기록" }
];

const defaultDbSummary: DbSummary = {
  description: "저장 상태를 확인 중입니다. 거래처 원장이 확인되기 전까지 거래처 목록은 비워 둡니다.",
  label: "원장 확인 중",
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

export default function CrmTimelinePage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const { companyName: sessionCompanyName, userName: sessionUserName } = useCustomerIdentity(isAdminPreview);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineSource, setTimelineSource] = useState<"empty" | "supabase">("empty");
  const [dbSummary, setDbSummary] = useState<DbSummary>(defaultDbSummary);
  const [dbError, setDbError] = useState("");
  const [customerSource, setCustomerSource] = useState<"loading" | "supabase" | "empty" | "error">("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  // 거래처 검색·목록 사이드바가 항상 펼쳐져 있으면 옆의 선택 거래처 상세(원장/첨부자료)가 계속
  // 좁게 눌려 보였습니다. 거래처를 고르면 자동으로 목록을 접어 상세가 전체 폭을 쓰도록 하고,
  // 필요하면 다시 펼칠 수 있게 했습니다.
  const [listCollapsed, setListCollapsed] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<"all" | "A" | "B" | "C">("all");
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState<ListPageSize>(30);

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
        setDbError(error instanceof Error ? error.message : "원장 상태 API 호출 실패");
        setDbSummary({
          description: "원장 상태 API 호출에 실패했습니다. 거래처 원장 연결 상태를 먼저 확인해야 합니다.",
          label: "원장 확인 실패",
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
          setCustomerSource(payload?.source === "empty" ? "empty" : "error");
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
  const [previewAttachment, setPreviewAttachment] = useState<{ mimeType: string; title: string; url: string } | null>(null);
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
  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / customerPageSize));
  const pagedCustomers = useMemo(() => {
    const start = (customerPage - 1) * customerPageSize;
    return filteredCustomers.slice(start, start + customerPageSize);
  }, [customerPage, customerPageSize, filteredCustomers]);
  const customerPageStart = filteredCustomers.length ? (customerPage - 1) * customerPageSize + 1 : 0;
  const customerPageEnd = Math.min(filteredCustomers.length, customerPage * customerPageSize);
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

  useEffect(() => {
    setCustomerPage((current) => Math.min(Math.max(current, 1), customerTotalPages));
  }, [customerTotalPages]);

  useEffect(() => {
    setCustomerPage(1);
  }, [customerPageSize, customerSearch, gradeFilter, operationFilter]);

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
  const loadingPositionAttachments = customerAttachments.filter((attachment) => attachment.attachmentType === "loading_position").length;
  // 사업자등록증·통장사본은 첨부자료함(customer_attachments) 외에도 데이터 등록의 OCR 저장 경로로
  // 거래처 원장에 직접 저장될 수 있어(businessLicenseFileUrl/bankAccountFileUrl), 두 경로를 모두 인식합니다.
  const businessCertificateAttachments =
    customerAttachments.filter((attachment) => attachment.attachmentType === "business_license").length || (selectedCustomer.businessLicenseFileUrl ? 1 : 0);
  const bankAccountAttachments =
    customerAttachments.filter((attachment) => attachment.attachmentType === "bank_account").length || (selectedCustomer.bankAccountFileUrl ? 1 : 0);
  const masterFileAttachments = [
    !customerAttachments.some((attachment) => attachment.attachmentType === "business_license") && selectedCustomer.businessLicenseFileUrl
      ? {
          id: "master-business-license",
          attachmentType: "business_license",
          createdAt: "데이터 등록 시 저장",
          fileUrl: selectedCustomer.businessLicenseFileUrl,
          mimeType: guessMimeType(selectedCustomer.businessLicenseFileUrl),
          storagePath: "",
          title: "사업자등록증"
        }
      : null,
    !customerAttachments.some((attachment) => attachment.attachmentType === "bank_account") && selectedCustomer.bankAccountFileUrl
      ? {
          id: "master-bank-account",
          attachmentType: "bank_account",
          createdAt: "데이터 등록 시 저장",
          fileUrl: selectedCustomer.bankAccountFileUrl,
          mimeType: guessMimeType(selectedCustomer.bankAccountFileUrl),
          storagePath: "",
          title: "통장사본"
        }
      : null
  ].filter((row): row is { id: string; attachmentType: string; createdAt: string; fileUrl: string; mimeType: string; storagePath: string; title: string } =>
    Boolean(row)
  );
  const combinedAttachments = [...customerAttachments, ...masterFileAttachments];
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
      description: customerNotes.length ? "최근 메모가 저장 이력으로 관리됩니다." : `${selectedCustomer.memoCount}건 기준 이력이 표시됩니다.`,
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
  const deliveryMessageNotes = customerNotes.filter((note) => note.noteType === "delivery_message").length;
  const routeActionNotes = customerNotes.filter((note) => note.noteType === "route_action").length;
  const fieldRecordSummary = {
    attachmentCount: customerAttachments.length,
    deliveryMessageCount: deliveryMessageNotes,
    deliveryProofCount: deliveryProofAttachments,
    loadingPositionCount: loadingPositionAttachments,
    memoCount: historyCount,
    recentMemoAt: latestNote?.createdAt || "이력 대기",
    routeActionCount: routeActionNotes,
    visitCount: selectedCustomer.visitCount
  };
  const draftBusinessNumberChanged = Boolean(
    draftCustomer &&
      normalizeBusinessRegistrationNumber(draftCustomer.businessNumber || "") !== normalizeBusinessRegistrationNumber(selectedCustomer.businessNumber || "")
  );
  const draftBusinessNumberValid = !draftCustomer?.businessNumber || isValidBusinessRegistrationNumber(draftCustomer.businessNumber || "");
  // 2026-08-27 피드백("사업자번호를 모를 수도 있으니깐 일단 생성과 변경 저장이 가능토록해") 반영:
  // 체크섬 검증은 참고용 안내로만 보여주고, 저장 자체는 막지 않습니다. 실제 현장에서는 등록 시점에
  // 사업자번호를 모르거나 나중에 확인해야 하는 거래처가 많아, 번호 형식이 의심스러워도 우선 저장할
  // 수 있어야 합니다(회사 자체 가입 화면의 엄격한 검증과는 별개 기준입니다).
  const canSaveCustomer = !isSaving;

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
          // 사업자번호를 몰라 임시값을 넣거나 나중에 정정하는 경우가 흔해, 저장 자체는 항상 허용합니다
          // (검증은 위 helper 텍스트로만 참고 안내).
          validateBusinessNumber: false,
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
          ? "거래처 정보가 화면에 반영되었습니다. 저장 상태는 관리자 시스템 점검에서 확인하세요."
          : movedToNext
            ? "저장되었습니다. 같은 보완 조건의 다음 거래처로 이동했습니다."
            : completedCleanupFilter
              ? "저장되었습니다. 현재 보완 필터의 남은 거래처가 없어 전체 목록으로 돌아갑니다."
            : "거래처 정보 저장이 완료되었습니다."
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
      // 2026-08-28 피드백 대응(국세청 API 장애가 "정상 조회됨"으로 보임): apiFailures가 있으면
      // 장애로 조회를 못한 건수가 있다는 걸 명확히 알리고(해당 건은 기존 상태 그대로 유지됨),
      // "N곳 갱신"이라는 성공 문구만 보고 전부 정상 처리된 것으로 착각하지 않게 합니다.
      const apiFailures = Number(payload?.apiFailures || 0);
      setBulkBusinessStatusMessage(
        `${payload?.checked || 0}곳 조회, ${payload?.updated || 0}곳 갱신${closedCount ? ` · 폐업 확인 ${closedCount}곳` : ""}${
          payload?.skippedNoBusinessNumber ? ` · 사업자번호 없음 ${payload.skippedNoBusinessNumber}곳 제외` : ""
        }${apiFailures ? ` · ⚠ 국세청 API 장애로 ${apiFailures}곳은 조회하지 못해 기존 상태를 유지했습니다` : ""}`
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

  // 파일을 선택하는 즉시 업로드합니다. 예전에는 파일 선택 후 별도로 "첨부자료 등록" 버튼을
  // 한 번 더 눌러야 저장됐는데, 그 두 번째 클릭이 눈에 잘 띄지 않아 파일을 선택하고도
  // "등록 대기" 상태로 남는 문제가 있었습니다.
  async function uploadAttachmentFiles(files: File[]) {
    if (!selectedCustomer?.id || !files.length) return;
    setIsAttachmentSaving(true);
    setAttachmentMessage("");

    try {
      const titleBase = newAttachmentTitle.trim() || attachmentTitleFromType(newAttachmentType);
      const uploadedAttachments: CustomerAttachmentView[] = [];
      let hasTemporaryResult = false;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const formData = new FormData();
        formData.append("attachmentType", newAttachmentType);
        formData.append("companyId", getAdminCompanyIdFromUrl());
        formData.append("customerId", selectedCustomer.id);
        formData.append("file", file);
        formData.append("title", files.length > 1 ? `${titleBase} ${index + 1}` : titleBase);
        const response = await fetch("/api/customer-attachments/upload", {
          method: "POST",
          body: formData
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `${file.name} 첨부자료 저장에 실패했습니다.`);
        if (payload?.attachment) uploadedAttachments.push(payload.attachment);
        if (payload?.uploaded === false || payload?.persisted === false) hasTemporaryResult = true;
      }

      if (uploadedAttachments.length) setCustomerAttachments((current) => [...uploadedAttachments, ...current]);
      setAttachmentMessage(
        hasTemporaryResult
          ? `${uploadedAttachments.length || files.length}건이 목록에 반영됐습니다. 파일 저장소 연결 상태를 확인하세요.`
          : `${uploadedAttachments.length || files.length}건의 첨부자료가 거래처 원장에 자동 저장됐습니다.`
      );
      setNewAttachmentTitle(attachmentTitleFromType(newAttachmentType));
      setNewAttachmentFiles([]);
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : "첨부자료 저장 중 오류가 발생했습니다.");
    } finally {
      setIsAttachmentSaving(false);
    }
  }

  async function saveAttachment() {
    if (!selectedCustomer?.id || !newAttachmentTitle.trim()) return;

    if (newAttachmentFiles.length) {
      await uploadAttachmentFiles(newAttachmentFiles);
      return;
    }

    setIsAttachmentSaving(true);
    setAttachmentMessage("");

    try {
      const uploadedAttachments: CustomerAttachmentView[] = [];
      let hasTemporaryResult = false;

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

      if (uploadedAttachments.length) setCustomerAttachments((current) => [...uploadedAttachments, ...current]);
      setAttachmentMessage(
        hasTemporaryResult
          ? `${uploadedAttachments.length || 1}건이 목록에 반영됐습니다. 파일 저장소 연결 상태를 확인하세요.`
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
      companyName={isAdminPreview ? "선택 고객사" : sessionCompanyName || "고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      subtitle="검색, 상세 수정, 메모·첨부 관리"
      title="거래처 관리"
      userName={isAdminPreview ? "관리자" : sessionUserName || "사용자"}
    >
      <section className="mx-auto max-w-[1560px]">
        <WorkspaceSectionNav
          items={[
            { active: true, description: "거래처를 검색하고 등급·보완 항목으로 좁힙니다.", href: "#customer-ledger-list", icon: Search, label: "목록" },
            { description: "사업자정보, 배송 기준값, 첨부자료를 수정합니다.", href: "#customer-ledger-detail", icon: Pencil, label: "원장" },
            { description: "상담 메모, 방문 기록, 다음 액션을 누적합니다.", href: "#customer-ledger-history", icon: FileText, label: "기록" }
          ]}
          title="거래처 관리"
        />

        <div className="min-w-0 space-y-4">
        <div className="maju-section-card scroll-mt-28" id="customer-ledger-list">
          <SectionHeader
            eyebrow="거래처 작업"
            title="거래처 목록"
            description="거래처를 선택하면 오른쪽에서 원장을 편집합니다."
          />
          <div className="grid gap-2 border-t border-slate-200/80 bg-white p-3 sm:grid-cols-3">
            {[
              { label: "1. 거래처 선택", value: `${filteredCustomers.length.toLocaleString()}곳`, icon: Search },
              { label: "2. 원장 확인", value: selectedCustomer.customerName || "미선택", icon: Building2 },
              { label: "3. 첨부·메모", value: `${combinedAttachments.length.toLocaleString()}건 · ${historyCount.toLocaleString()}건`, icon: FileText }
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2"
                  key={item.label}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${index === 1 ? "bg-teal-700 text-white" : "bg-white text-teal-700 ring-1 ring-inset ring-teal-100"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black text-slate-500">{item.label}</span>
                    <span className="mt-0.5 block truncate text-sm font-black text-slate-950">{item.value}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {/*
            검색·필터 사이드바(360~400px)가 거래처 상세(원장/첨부자료) 그리드 옆에 항상 펼쳐져 있으면,
            상세 쪽에 실제로 남는 폭이 좁아져 안의 정보가 눌려 보였습니다. 거래처를 고르면 목록을
            자동으로 접어서 상세가 전체 폭을 쓰게 하고, 필요할 때만 다시 펼치도록 했습니다.
          */}
          <div className="space-y-4 border-t border-slate-200/80 bg-slate-50/50 p-4">
            {listCollapsed ? (
              <button
                aria-label="거래처 검색·목록 펼치기"
                className="maju-section-card flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50"
                onClick={() => setListCollapsed(false)}
                type="button"
              >
                <PanelLeftOpen className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-black text-slate-950">거래처 검색·목록</span>
                  <span className="text-xs font-bold text-slate-500">
                    {selectedCustomer.customerName} 선택됨 · {filteredCustomers.length}/{customers.length}곳
                  </span>
                </span>
              </button>
            ) : (
            <aside className="maju-section-card">
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
                  <p className="maju-muted-label px-0.5 pb-1.5">빠른 필터</p>
                  <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
                    <CustomerFilterButton active={operationFilter === "all"} count={customers.length} label="전체" onClick={clearOperationFilter} />
                    <CustomerFilterButton active={operationFilter === "business-check"} count={businessCheckCount} label="사업자 확인" onClick={() => applyOperationFilter("business-check")} tone="danger" />
                    <CustomerFilterButton active={operationFilter === "loading-missing"} count={loadingMissingCount} label="적재위치" onClick={() => applyOperationFilter("loading-missing")} tone="warning" />
                  </div>
                  <div className="maju-filter-box mt-3">
                    <p className="maju-muted-label px-2 pb-1">매출 등급</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["all", "A", "B", "C"] as const).map((grade) => (
                        <button
                          className={`h-9 rounded-md border text-xs font-black transition ${
                            gradeFilter === grade
                              ? "border-teal-700 bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]"
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
                  <details className="maju-filter-box mt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-1 text-xs font-black text-slate-500">
                      상세 보완 필터
                      <Badge className="bg-slate-100 text-slate-600">{addressMissingCount + businessNumberMissingCount + contactMissingCount + managerMissingCount}건</Badge>
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <CustomerFilterButton active={operationFilter === "address-missing"} count={addressMissingCount} label="주소 미등록" onClick={() => applyOperationFilter("address-missing")} tone="danger" />
                      <CustomerFilterButton active={operationFilter === "business-number-missing"} count={businessNumberMissingCount} label="사업자번호" onClick={() => applyOperationFilter("business-number-missing")} tone="warning" />
                      <CustomerFilterButton active={operationFilter === "contact-missing"} count={contactMissingCount} label="연락처" onClick={() => applyOperationFilter("contact-missing")} />
                      <CustomerFilterButton active={operationFilter === "manager-missing"} count={managerMissingCount} label="담당자" onClick={() => applyOperationFilter("manager-missing")} />
                    </div>
                  </details>
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
            {filteredCustomers.length ? (
              <div className="space-y-2 border-b border-slate-200/80 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-500">
                    보기
                    <select
                      className="h-6 border-0 bg-transparent p-0 text-[11px] font-black text-slate-900 outline-none focus:ring-0"
                      onChange={(event) => setCustomerPageSize(Number(event.target.value) as ListPageSize)}
                      value={customerPageSize}
                    >
                      {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}개
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-500">
                    {customerPageStart.toLocaleString()}-{customerPageEnd.toLocaleString()} / {filteredCustomers.length.toLocaleString()}곳
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={customerPage <= 1}
                    onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}
                    type="button"
                  >
                    이전
                  </button>
                  <span className="px-1 text-[11px] font-black text-slate-400">
                    {customerPage.toLocaleString()} / {customerTotalPages.toLocaleString()}
                  </span>
                  <button
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={customerPage >= customerTotalPages}
                    onClick={() => setCustomerPage((page) => Math.min(customerTotalPages, page + 1))}
                    type="button"
                  >
                    다음
                  </button>
                </div>
              </div>
            ) : null}
            {filteredCustomers.length ? (
              <div className="grid grid-cols-[20px_minmax(0,1fr)_44px_64px] items-center gap-2 border-b border-slate-200/80 bg-slate-50/70 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <input
                  aria-label="현재 페이지 전체 선택"
                  checked={pagedCustomers.some(({ customer }) => Boolean(customer.id)) && pagedCustomers.every(({ customer }) => !customer.id || bulkSelectedIds.has(customer.id))}
                  className="h-3.5 w-3.5 shrink-0"
                  onChange={(event) => {
                    const pageIds = pagedCustomers.map(({ customer }) => customer.id).filter((id): id is string => Boolean(id));
                    setBulkSelectedIds((current) => {
                      if (event.target.checked) return new Set([...Array.from(current), ...pageIds]);
                      const next = new Set(current);
                      pageIds.forEach((id) => next.delete(id));
                      return next;
                    });
                  }}
                  type="checkbox"
                />
                <span>상호명</span>
                <span className="text-center">등급</span>
                <span className="text-right">상태</span>
              </div>
            ) : null}
            <div className="divide-y divide-slate-100">
              {pagedCustomers.map(({ customer, index }) => {
                const issues = customerOperationalIssues(customer);
                const selected = index === selectedIndex;
                return (
                  <div
                    key={`${customer.customerName}-${customer.address}`}
                    className={`grid grid-cols-[20px_minmax(0,1fr)_44px_64px] items-center gap-2 px-3 py-2 transition ${
                      selected ? "bg-slate-50" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    {customer.id ? (
                      <input
                        aria-label={`${customer.customerName} 일괄 선택`}
                        checked={bulkSelectedIds.has(customer.id)}
                        className="h-3.5 w-3.5 shrink-0"
                        onChange={() => toggleBulkSelected(customer.id as string)}
                        type="checkbox"
                      />
                    ) : (
                      <span />
                    )}
                    <button
                      className="min-w-0 text-left"
                      onClick={() => {
                        setSelectedIndex(index);
                        setListCollapsed(true);
                      }}
                      type="button"
                    >
                      <span className="block truncate text-sm font-black text-slate-950">{customer.customerName}</span>
                      <span className="block truncate text-[11px] font-bold text-slate-400">{customer.region}</span>
                    </button>
                    <Badge className={`justify-self-center px-1.5 py-0 text-[10px] ${gradeClassName(customer.grade)}`}>{customer.grade}</Badge>
                    <Badge className={`justify-self-end px-1.5 py-0 text-[10px] ${issues.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {issues.length ? "보완" : "가능"}
                    </Badge>
                  </div>
                );
              })}
              {!filteredCustomers.length ? (
                <div className="maju-empty-state m-4">
                  <p className="text-sm font-black text-slate-700">{hasCustomers ? "조건에 맞는 거래처가 없습니다." : "등록된 거래처가 없습니다."}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {hasCustomers ? "검색어, 등급 또는 운영 필터를 바꿔보세요." : "거래처를 업로드하거나 수기로 등록하면 이곳에 표시됩니다."}
                  </p>
                </div>
              ) : null}
              {customersTruncated ? (
                <div className="space-y-1.5 p-3">
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
                  <div className="inline-flex h-11 items-center overflow-hidden rounded-md border border-slate-200 bg-white text-xs font-black text-slate-700">
                    <button
                      aria-label="이전 거래처"
                      className="grid h-full w-11 place-items-center border-r border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
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
                      className="grid h-full w-11 place-items-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
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
                  <p className="maju-muted-label">선택 거래처 작업</p>
                  <p className="mt-1 truncate text-sm font-black text-slate-950">{customerDetailTabs.find((tab) => tab.id === detailTab)?.description}</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_1px_0_rgba(15,23,42,0.03)] lg:w-auto">
                  {customerDetailTabs.map((tab) => {
                    const Icon = tab.icon;
                    const selected = detailTab === tab.id;
                    return (
                      <button
                        className={`group flex h-9 min-w-[104px] items-center justify-center gap-2 rounded-md border px-3 text-sm font-black transition ${
                          selected
                            ? "border-teal-700 bg-teal-700 text-white shadow-sm"
                            : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                        }`}
                        key={tab.id}
                        onClick={() => setDetailTab(tab.id)}
                        title={`${tab.label} · ${tab.helper}`}
                        type="button"
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-white" : "text-slate-400"}`} />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {detailTab === "ledger" ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3">
              <div className="maju-section-card overflow-hidden">
                <div className="maju-card-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-teal-700">거래처 원장</p>
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
                    <div className="maju-panel border-teal-100 bg-teal-50/60 p-3">
                      <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                        <MapPin className="h-4 w-4 text-teal-700" />
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
                      {addressSearchMessage ? <p className="mt-2 text-xs font-black text-teal-700">{addressSearchMessage}</p> : null}
                      {addressResults.length ? (
                        <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                          {addressResults.map((result) => (
                            <button
                              className="maju-filter-box w-full bg-white p-3 text-left hover:border-teal-300 hover:bg-teal-50"
                              key={`${result.address}-${result.longitude}-${result.latitude}`}
                              onClick={() => selectAddress(result)}
                              type="button"
                            >
                              <span className="block text-sm font-black text-slate-950">{result.address}</span>
                              {result.jibunAddress && result.jibunAddress !== result.address ? <span className="mt-1 block text-xs font-bold text-slate-500">지번 {result.jibunAddress}</span> : null}
                              <span className="mt-1 block text-xs font-black text-teal-700">
                                {result.region || "지역 자동 추출"} {result.postalCode ? `· 우편번호 ${result.postalCode}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-3 gap-y-3">
                      <EditableField label="상호명" value={draftCustomer.customerName} onChange={(value) => updateDraft("customerName", value)} />
                      <EditableField
                        helper={
                          draftBusinessNumberChanged
                            ? draftBusinessNumberValid
                              ? `${formatBusinessRegistrationNumber(draftCustomer.businessNumber || "")} 검증 완료`
                              : "형식이 확인되지 않았지만 저장은 가능합니다. 나중에 정확한 번호로 수정해 주세요."
                            : "기존 번호 유지"
                        }
                        helperTone={draftBusinessNumberChanged && !draftBusinessNumberValid ? "muted" : draftBusinessNumberChanged ? "success" : "muted"}
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
                  <p className="text-xs font-black uppercase tracking-wide text-teal-700">첨부자료</p>
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
                    <div className="maju-card-header flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">자료 추가</p>
                        <p className="mt-1 text-sm font-black text-slate-950">파일 업로드와 외부 URL 등록을 구분해서 저장합니다.</p>
                      </div>
                      <Badge className="w-fit bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                        파일 선택 즉시 저장
                      </Badge>
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
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)]">
                        <label className="maju-panel flex min-h-28 cursor-pointer items-center gap-3 border-dashed border-teal-200 bg-teal-50/60 p-3 text-left transition hover:border-teal-300 hover:bg-teal-50">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-700 text-white">
                            <Plus className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-slate-950">
                              {isAttachmentSaving ? "업로드 중..." : newAttachmentFiles.length ? `${newAttachmentFiles.length}개 파일 저장 중` : "+ 파일 업로드"}
                            </span>
                            <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                              사진, PDF, 영상을 선택하면 거래처 원장에 바로 저장됩니다. 파일당 최대 50MB.
                            </span>
                            {newAttachmentFiles.length ? (
                              <span className="mt-2 flex flex-wrap gap-1">
                                {newAttachmentFiles.slice(0, 4).map((file) => (
                                  <span className="max-w-[180px] truncate rounded-md bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-inset ring-teal-100" key={`${file.name}-${file.size}`}>
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
                            disabled={isAttachmentSaving}
                            multiple
                            onChange={(event) => {
                              const files = Array.from(event.target.files || []);
                              event.target.value = "";
                              if (!files.length) return;
                              setNewAttachmentFiles(files);
                              uploadAttachmentFiles(files);
                            }}
                            type="file"
                          />
                        </label>
                        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                          <label className="grid gap-1.5">
                            <span className="text-xs font-black text-slate-500">외부 URL로 등록</span>
                            <input
                              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                              onChange={(event) => setNewAttachmentUrl(event.target.value)}
                              placeholder="이미 업로드된 파일 URL"
                              value={newAttachmentUrl}
                            />
                          </label>
                          <button
                            className="maju-button-secondary mt-2 inline-flex h-10 w-full items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={!newAttachmentTitle.trim() || !newAttachmentUrl.trim() || isAttachmentSaving}
                            onClick={saveAttachment}
                            type="button"
                          >
                            <LinkIcon className="h-4 w-4" />
                            {isAttachmentSaving ? "등록 중" : "URL 등록"}
                          </button>
                        </div>
                      </div>
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
                      <Badge className="bg-slate-100 text-slate-700">{combinedAttachments.length}건</Badge>
                    </div>
                    <div className="grid gap-0">
                      {combinedAttachments.length ? (
                        combinedAttachments.map((attachment) => (
                          <AttachmentRow
                            key={attachment.id}
                            icon={attachment.attachmentType === "loading_position" ? PackageCheck : FileText}
                            label={attachmentLabel(attachment.attachmentType, attachment.title)}
                            mimeType={attachment.mimeType || guessMimeType(attachment.fileUrl)}
                            storagePath={attachment.storagePath}
                            url={attachment.fileUrl}
                            value={attachment.createdAt}
                            onPreview={setPreviewAttachment}
                          />
                        ))
                      ) : (
                        <>
                          <AttachmentRow icon={PackageCheck} label="적재위치 사진/영상" value="미등록 · 자료 추가에서 업로드" />
                          <AttachmentRow icon={FileText} label="사업자등록증" value="미등록 · OCR 또는 파일 업로드" />
                          <AttachmentRow icon={FileText} label="통장사본" value="미등록 · 파일 업로드" />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div> : null}

            {detailTab === "history" ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4">
              <div className="maju-section-card overflow-hidden">
                <div className="maju-card-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-teal-700">활동 기록</p>
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
                          <Badge className={noteTypeBadgeClass(note.noteType)}>{noteTypeLabel(note.noteType)}</Badge>
                          <span className="text-xs font-bold text-slate-400">{note.createdAt}</span>
                        </div>
                        <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                          <LinkifiedText text={note.memo} />
                        </p>
                        {note.nextAction ? <p className="mt-2 text-xs font-black text-blue-700">다음 액션: {note.nextAction}</p> : null}
                      </div>
                    ))
                  ) : (
                    <div className="maju-empty-state m-4">
                      <p className="text-sm font-black text-slate-700">아직 저장된 메모가 없습니다.</p>
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
                <div className="space-y-3 bg-slate-50/60 p-3">
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
                    <div className="maju-empty-state m-4">
                      <p className="text-sm font-black text-slate-800">아직 실제 방문/액션 기록이 없습니다.</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        왼쪽 메모 히스토리에서 첫 메모를 저장하면 이 영역에 바로 표시됩니다. 방문/액션 기록은 저장된 데이터만 표시합니다.
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
      {previewAttachment ? <AttachmentPreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} /> : null}
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

// 2026-08-30 피드백("다수 고객들 사용할 수 있도록 개선된거야?") 대응: 이 페이지는 클라이언트
// 컴포넌트라 서버 세션을 직접 읽지 못해, 지금까지는 모든 일반 고객 로그인에 회사명/이름을
// "마주식자재"/"정두영"으로 고정 표시하고 있었습니다(다른 고객사가 로그인해도 항상 이렇게 보임 —
// 실제 데이터 자체는 세션 쿠키로 서버에서 이미 회사별로 분리돼 있지만 헤더 표시만 틀렸던 것).
// /api/customer/me로 실제 로그인한 회사명·이름을 가져와 어떤 고객사든 자기 정보를 보게 합니다.
function useCustomerIdentity(isAdminPreview: boolean) {
  const [companyName, setCompanyName] = useState("");
  const [userName, setUserName] = useState("");
  useEffect(() => {
    if (isAdminPreview) return;
    let ignore = false;
    fetch("/api/customer/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (ignore || !payload?.session) return;
        setCompanyName(payload.session.companyName || "");
        setUserName(payload.session.name || "");
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [isAdminPreview]);
  return { companyName, userName };
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
  customerSource: "loading" | "supabase" | "empty" | "error";
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
        ? "거래처 원장"
        : customerSource === "empty"
          ? "거래처 원장 비어 있음"
          : "거래처 원장 미연결";

  return (
    <div className={`mt-3 rounded-md border px-3 py-2 ${hasCustomers ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${hasCustomers ? "bg-emerald-500" : "bg-amber-500"}`} />
          <p className={`truncate text-xs font-black ${hasCustomers ? "text-slate-700" : "text-amber-900"}`}>
            {sourceLabel} · {hasCustomers ? `${visibleCount.toLocaleString()}/${totalCount.toLocaleString()}곳` : "등록 필요"}
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
              전체 원장 기준
            </span>
          )}
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
      deliveryMessageCount: number;
      deliveryProofCount: number;
      loadingPositionCount: number;
      memoCount: number;
      routeActionCount: number;
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
      helper: "전화·지도·주소 확인",
      icon: Route,
      label: "현장 액션",
      value: `${summary.routeActionCount.toLocaleString()}건`
    },
    {
      action: onOpenHistory,
      helper: `알림 이력 ${summary.deliveryMessageCount.toLocaleString()}건`,
      icon: CheckCircle2,
      label: "배송완료",
      value: `${summary.deliveryProofCount.toLocaleString()}건`
    }
  ];

  return (
    <div className="overflow-hidden rounded-md border border-teal-100 bg-white">
      <div className="flex flex-col gap-3 border-b border-teal-100/80 bg-teal-50/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Field Record</p>
          <h3 className="mt-1 text-base font-black text-slate-950">현장 기록</h3>
        </div>
        <Badge className="w-fit bg-white text-teal-800 ring-1 ring-teal-100">방문 {summary.visitCount.toLocaleString()}회</Badge>
      </div>
      <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-teal-200 hover:bg-teal-50"
              key={item.label}
              onClick={item.action}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-teal-700 text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-lg font-black text-slate-950">{item.value}</span>
              </div>
              <p className="mt-2 text-sm font-black text-slate-900">{item.label}</p>
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


function LedgerSectionLabel({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
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
    <div className="min-w-0 border-b border-r border-slate-200 bg-white px-3 py-2.5 last:border-r-0 xl:border-b-0">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="maju-muted-label">{label}</p>
      </div>
      <p className="mt-1.5 truncate text-sm font-black text-slate-950" title={value}>
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
    <div className={`min-w-0 border-r border-slate-200 px-3 py-2.5 last:border-r-0 ${toneClassName}`}>
      <p className="text-xs font-black opacity-70">{label}</p>
      <p className="mt-1.5 truncate text-sm font-black" title={value}>
        {value}
      </p>
      <p className="mt-1 truncate text-xs font-bold opacity-60" title={helper}>{helper}</p>
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
      <div className="maju-panel border-teal-100 bg-teal-50/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-white text-teal-700 ring-1 ring-inset ring-teal-200">기록 요약</Badge>
          <Badge className="bg-teal-700 text-white">{historyCount}건</Badge>
        </div>
        <p className="mt-2 text-sm font-black text-slate-950">
          {latestNote ? "최근 메모가 저장 이력으로 관리 중입니다." : "아직 저장된 메모가 없습니다."}
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
    <div className={`maju-section-card p-4 ${ready ? "border-teal-100 bg-teal-50/80" : "border-amber-200 bg-amber-50/80"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ready ? "bg-teal-700 text-white" : "bg-amber-500 text-white"}>배송 핵심</Badge>
            <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{attachmentCount}개 자료</Badge>
          </div>
          <h4 className="mt-3 text-base font-black text-slate-950">배송 적재위치</h4>
          <p className="mt-2 rounded-md border border-white/80 bg-white px-3 py-2 text-sm font-black leading-6 text-teal-900">
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
    <div className="maju-section-card mt-4 overflow-hidden">
      <div className="maju-card-header flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">첨부자료 준비 상태</p>
          <p className="mt-1 text-xs font-bold text-slate-500">필수 자료가 채워질수록 원장 신뢰도가 올라갑니다.</p>
        </div>
        <Badge className={progress === 100 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
          {readyCount}/{checklist.length} 완료
        </Badge>
      </div>
      <div className="h-1.5 bg-slate-100">
        <div className="h-full bg-emerald-600" style={{ width: `${progress}%` }} />
      </div>
      <div className="hidden grid-cols-[140px_72px_80px_minmax(0,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-black text-slate-400 md:grid">
        <span>자료명</span>
        <span>구분</span>
        <span>상태</span>
        <span>관리 기준</span>
      </div>
      <div className="divide-y divide-slate-100">
        {checklist.map((item) => (
          <div
            key={item.type}
            className={`grid gap-2 px-4 py-3 md:grid-cols-[140px_72px_80px_minmax(0,1fr)] md:items-center md:gap-3 ${
              item.type === "loading_position"
                ? "bg-teal-50/60"
                : item.count > 0
                  ? "bg-emerald-50/40"
                  : "bg-white"
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{item.label}</p>
              {item.type === "loading_position" ? <p className="mt-0.5 text-[11px] font-black text-teal-700">배송 최우선 자료</p> : null}
            </div>
            <Badge className={`w-fit ${item.required ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100" : "bg-slate-100 text-slate-600"}`}>
              {item.required ? "필수" : "선택"}
            </Badge>
            <Badge className={`w-fit ${item.count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {item.count > 0 ? `${item.count}건` : "대기"}
            </Badge>
            <p className="min-w-0 text-xs font-bold leading-5 text-slate-500 md:truncate" title={item.description}>
              {item.description}
            </p>
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
  const searchLinks = buildPlaceSearchLinks(customer.customerName, customer.address);

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

function buildPlaceSearchLinks(customerName: string, address?: string) {
  const fullQuery = [customerName, address].map((value) => value?.trim()).filter(Boolean).join(" ") || "거래처";
  const encodedFullQuery = encodeURIComponent(fullQuery);
  // 네이버 지도는 상호명+상세주소(동/호수·층수 포함)로 검색하면 네이버 DB 주소 표기와 조금만 달라도
  // 결과가 없거나 다른 곳으로 연결되는 경우가 많아, 상호명 단독 검색이 훨씬 안정적으로 매칭됩니다.
  const encodedNaverQuery = encodeURIComponent(customerName?.trim() || fullQuery);
  return [
    { href: `https://map.naver.com/p/search/${encodedNaverQuery}`, label: "네이버 지도" },
    { href: `https://section.blog.naver.com/Search/Post.naver?keyword=${encodedFullQuery}`, label: "네이버 블로그" },
    { href: `https://map.kakao.com/?q=${encodedFullQuery}`, label: "카카오맵" },
    { href: `https://www.google.com/maps/search/${encodedFullQuery}`, label: "구글맵" }
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

function AttachmentRow({
  icon: Icon,
  label,
  mimeType = "",
  onPreview,
  storagePath = "",
  url = "",
  value
}: {
  icon: typeof PackageCheck;
  label: string;
  mimeType?: string;
  onPreview?: (attachment: { mimeType: string; title: string; url: string }) => void;
  storagePath?: string;
  url?: string;
  value: string;
}) {
  const statusLabel = storagePath ? "Storage 저장" : url ? "외부 링크" : "미등록";
  const statusClassName = storagePath
    ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
    : url
      ? "bg-blue-50 text-blue-800 ring-blue-100"
      : "bg-amber-50 text-amber-800 ring-amber-100";
  // 이미지·PDF·영상은 화면에서 바로 미리보기가 가능합니다. 그 외 형식은 새창 링크만 제공합니다.
  const canPreviewInline = /^image\/|^video\/|^application\/pdf/.test(mimeType);

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
        <div className="flex items-center gap-1.5">
          {canPreviewInline ? (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-black text-blue-700 hover:bg-blue-100"
              onClick={() => onPreview?.({ mimeType, title: label, url })}
              type="button"
            >
              <Eye className="h-3.5 w-3.5" />
              미리보기
            </button>
          ) : null}
          <a
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
            href={url}
            rel="noreferrer"
            target="_blank"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            새창
          </a>
        </div>
      ) : null}
    </div>
  );
}

function AttachmentPreviewModal({
  attachment,
  onClose
}: {
  attachment: { mimeType: string; title: string; url: string };
  onClose: () => void;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const isVideo = attachment.mimeType.startsWith("video/");
  const isPdf = attachment.mimeType === "application/pdf";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{attachment.title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
              href={attachment.url}
              rel="noreferrer"
              target="_blank"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              새창에서 열기
            </a>
            <button
              className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
          {isImage ? (
            <img alt={attachment.title} className="mx-auto max-h-[75vh] w-auto object-contain" src={attachment.url} />
          ) : isVideo ? (
            <video className="mx-auto max-h-[75vh] w-full" controls src={attachment.url} />
          ) : isPdf ? (
            <iframe className="h-[75vh] w-full rounded-md border border-slate-200 bg-white" src={attachment.url} title={attachment.title} />
          ) : (
            <div className="maju-empty-state p-6">
              <p className="text-sm font-black text-slate-800">이 형식은 화면 미리보기를 지원하지 않습니다.</p>
              <p className="mt-1 text-xs font-bold text-slate-500">위의 "새창에서 열기"를 눌러 확인하세요.</p>
            </div>
          )}
        </div>
      </div>
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
  if (type === "delivery") return "배송 기록";
  if (type === "delivery_message") return "발송 기록";
  if (type === "route_action") return "현장 액션";
  if (type === "sales") return "영업 상담";
  if (type === "settlement") return "정산";
  return "메모";
}

function noteTypeBadgeClass(type: string) {
  if (type === "delivery") return "bg-emerald-50 text-emerald-700";
  if (type === "delivery_message") return "bg-sky-50 text-sky-700";
  if (type === "route_action") return "bg-teal-50 text-teal-700";
  if (type === "sales") return "bg-blue-50 text-blue-700";
  if (type === "settlement") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
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
