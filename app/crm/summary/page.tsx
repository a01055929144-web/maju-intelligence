"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, FileBadge2, FileSpreadsheet, ImageDown, ImageOff, MapPin, Plus, Printer, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
import { SectionHeader } from "@/components/section-header";

type TimelineItem = {
  id: string;
  expectedRevenue: number;
  result: string;
};

type CustomerSummaryRow = {
  id?: string;
  address: string;
  businessLicenseFileUrl?: string;
  businessNumber?: string;
  businessStatus?: string;
  customerName: string;
  deliveryManager?: string;
  grade: "A" | "B" | "C";
  loadingPosition?: string;
  monthlyRevenue: number;
  phone?: string;
  representativeName?: string;
};

type OperationsSummaryEntry = {
  memoCount: number;
  latestMemo?: string;
  loadingPositionPhotoUrl?: string;
};

type StatusFilter = "all" | "정상" | "휴업" | "폐업" | "확인 필요";
const LIST_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

function withCompanyQuery(path: string) {
  const companyId = getAdminCompanyIdFromUrl();
  if (!companyId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
}

function useAdminCompanyId() {
  const [companyId, setCompanyId] = useState("");
  useEffect(() => {
    setCompanyId(getAdminCompanyIdFromUrl());
  }, []);
  return companyId;
}

function formatBusinessRegistrationNumber(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function businessStatusToneClassName(status: string | undefined) {
  if (status === "정상") return "bg-emerald-100 text-emerald-800";
  if (status === "휴업") return "bg-amber-100 text-amber-800";
  if (status === "폐업") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function gradeClassName(grade: string) {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

function customerOperationalIssueCount(customer: CustomerSummaryRow) {
  let count = 0;
  if (customer.businessStatus !== "정상") count += 1;
  if (!customer.phone || !customer.representativeName) count += 1;
  if (!customer.address) count += 1;
  if (!customer.loadingPosition) count += 1;
  return count;
}

export default function CrmSummaryPage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [dbError, setDbError] = useState("");
  const [customers, setCustomers] = useState<CustomerSummaryRow[]>([]);
  const [customerSource, setCustomerSource] = useState<"loading" | "supabase" | "empty" | "error">("loading");
  const [operationsSummary, setOperationsSummary] = useState<Record<string, OperationsSummaryEntry>>({});
  const [tableSearch, setTableSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState<ListPageSize>(30);
  const [exportMessage, setExportMessage] = useState("");
  const [isExportingImage, setIsExportingImage] = useState(false);
  const exportTableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    fetch(withCompanyQuery("/api/customer/history-status"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        setTimeline(Array.isArray(payload.timeline) ? payload.timeline : []);
        if (payload.errorMessage) setDbError(payload.errorMessage);
      })
      .catch(() => {
        if (!active) return;
        setDbError("원장 상태를 확인하지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAllCustomers() {
      const collected: CustomerSummaryRow[] = [];
      let offset = 0;
      let truncated = true;
      let source: "supabase" | "empty" | "error" = "empty";
      let iterations = 0;

      while (truncated && iterations < 20) {
        iterations += 1;
        const response = await fetch(withCompanyQuery(`/api/customers?offset=${offset}`), { cache: "no-store" });
        if (!response.ok) {
          source = "error";
          break;
        }
        const payload = await response.json();
        if (payload?.source !== "supabase") {
          source = payload?.source === "empty" ? "empty" : "error";
          break;
        }
        source = "supabase";
        const batch = Array.isArray(payload.customers) ? payload.customers : [];
        collected.push(...batch);
        truncated = Boolean(payload.truncated);
        offset += batch.length;
        if (!batch.length) break;
      }

      return { customers: collected, source };
    }

    loadAllCustomers()
      .then(({ customers: allCustomers, source }) => {
        if (!active) return;
        setCustomers(allCustomers);
        setCustomerSource(source);
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

  useEffect(() => {
    let active = true;
    const ids = customers.map((customer) => customer.id).filter((id): id is string => Boolean(id));
    if (!ids.length) {
      setOperationsSummary({});
      return;
    }

    async function loadSummary() {
      const merged: Record<string, OperationsSummaryEntry> = {};
      for (const batch of chunk(ids, 150)) {
        const response = await fetch(withCompanyQuery(`/api/customer-operations/summary?customerIds=${batch.map(encodeURIComponent).join(",")}`), {
          cache: "no-store"
        });
        if (!response.ok) continue;
        const payload = await response.json().catch(() => null);
        Object.assign(merged, payload?.summary || {});
      }
      return merged;
    }

    loadSummary().then((merged) => {
      if (!active) return;
      setOperationsSummary(merged);
    });

    return () => {
      active = false;
    };
  }, [customers]);

  const hasOperationalLedger = customerSource === "supabase";
  const hasCustomers = customers.length > 0;
  const ledgerStatusLabel =
    customerSource === "loading" ? "원장 확인 중" : hasOperationalLedger ? "거래처 원장 연결" : "거래처 원장 미연결";
  const ledgerStatusDescription = hasOperationalLedger
    ? "Supabase 거래처 원장 기준으로 목록과 상세를 표시합니다."
    : "데이터 등록에서 거래처를 저장하면 이 화면에 실제 원장이 표시됩니다.";
  const expectedRevenue = timeline.reduce((total, item) => total + item.expectedRevenue, 0);
  const addressMissingCount = customers.filter((customer) => !customer.address).length;
  const businessNumberMissingCount = customers.filter((customer) => !customer.businessNumber).length;
  const managerMissingCount = customers.filter((customer) => !customer.deliveryManager).length;
  const loadingReadyCount = customers.filter((customer) => Boolean(customer.loadingPosition)).length;
  const managerCount = new Set(customers.map((customer) => customer.deliveryManager).filter(Boolean)).size;
  const realMemoCount = customers.reduce((sum, customer) => sum + (customer.id ? operationsSummary[customer.id]?.memoCount || 0 : 0), 0);
  const needsAttentionCount = customers.filter((customer) => customerOperationalIssueCount(customer) > 0).length;
  const readyCustomerCount = customers.length - needsAttentionCount;

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: customers.length, 정상: 0, 휴업: 0, 폐업: 0, "확인 필요": 0 };
    for (const customer of customers) {
      const status = (customer.businessStatus as StatusFilter) || "확인 필요";
      if (status in counts) counts[status] += 1;
      else counts["확인 필요"] += 1;
    }
    return counts;
  }, [customers]);

  const filteredRows = useMemo(() => {
    const keyword = tableSearch.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesStatus = statusFilter === "all" || (customer.businessStatus || "확인 필요") === statusFilter;
      const matchesKeyword =
        !keyword ||
        [customer.customerName, customer.representativeName, customer.phone, customer.businessNumber, customer.address]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      return matchesStatus && matchesKeyword;
    });
  }, [customers, statusFilter, tableSearch]);
  const tableTotalPages = Math.max(1, Math.ceil(filteredRows.length / tablePageSize));
  const currentTablePage = Math.min(tablePage, tableTotalPages);
  const pagedRows = useMemo(() => {
    const start = (currentTablePage - 1) * tablePageSize;
    return filteredRows.slice(start, start + tablePageSize);
  }, [currentTablePage, filteredRows, tablePageSize]);
  const tablePageStart = filteredRows.length ? (currentTablePage - 1) * tablePageSize + 1 : 0;
  const tablePageEnd = Math.min(filteredRows.length, currentTablePage * tablePageSize);

  useEffect(() => {
    setTablePage((current) => Math.min(Math.max(current, 1), tableTotalPages));
  }, [tableTotalPages]);

  useEffect(() => {
    setTablePage(1);
  }, [statusFilter, tablePageSize, tableSearch]);

  async function downloadExcel() {
    setExportMessage("");
    try {
      // 엑셀 쓰기 라이브러리는 실제로 다운로드 버튼을 눌렀을 때만 불러옵니다(초기 번들 크기 절약).
      const writeXlsxFileModule = await import("write-excel-file/browser");
      const headerRow = ["거래처명", "대표자명", "연락처", "사업자번호", "사업자 상태", "메모", "사업자등록증", "적재위치 사진"].map((value) => ({
        fontWeight: "bold" as const,
        value
      }));
      const dataRows = filteredRows.map((customer) => {
        const summaryEntry = customer.id ? operationsSummary[customer.id] : undefined;
        return [
          { value: customer.customerName },
          { value: customer.representativeName || "" },
          { value: customer.phone || "" },
          { value: customer.businessNumber ? formatBusinessRegistrationNumber(customer.businessNumber) : "" },
          { value: customer.businessStatus || "확인 필요" },
          { value: summaryEntry?.latestMemo || "" },
          { value: customer.businessLicenseFileUrl || "미등록" },
          { value: summaryEntry?.loadingPositionPhotoUrl || "미등록" }
        ];
      });
      await writeXlsxFileModule.default([headerRow, ...dataRows], { sheet: "거래처 전체 현황" }).toFile("거래처_전체현황.xlsx");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "엑셀 다운로드에 실패했습니다.");
    }
  }

  async function downloadImage() {
    if (!exportTableRef.current || isExportingImage) return;
    setExportMessage("");
    setIsExportingImage(true);
    try {
      // 이미지 캡처 라이브러리도 버튼을 눌렀을 때만 불러옵니다.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(exportTableRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = "거래처_전체현황.png";
      link.href = dataUrl;
      link.click();
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "이미지 다운로드에 실패했습니다.");
    } finally {
      setIsExportingImage(false);
    }
  }

  function downloadPdf() {
    setExportMessage("");
    window.print();
  }

  return (
    <CustomerAppShell
      active="customers-summary"
      companyName={isAdminPreview ? "선택 고객사" : "마주식자재"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      subtitle="거래처, 사업자 상태, 메모·첨부 현황"
      title="전체 현황"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <section className="mx-auto max-w-[1560px] space-y-3">
        <div className="maju-section-card">
          <SectionHeader
            eyebrow="지도 작업공간"
            title="전체 현황"
            description="지도 홈이 사용하는 거래처 기준입니다."
          />
          <div className="p-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[150px_repeat(3,minmax(0,1fr))]">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-1">
                  <p className="maju-muted-label">원장 상태</p>
                  <InfoTooltip size="sm" text={ledgerStatusDescription} tone={hasOperationalLedger ? "emerald" : "amber"} />
                </div>
                <Badge className={`mt-1.5 ${hasOperationalLedger ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{ledgerStatusLabel}</Badge>
              </div>
              <SummaryCard helper={hasOperationalLedger ? "지도 홈 기준" : "거래처 등록 필요"} label="전체 거래처" value={hasOperationalLedger ? `${customers.length}곳` : "등록 필요"} />
              <SummaryCard helper="매출 상위 등급" label="A등급" value={`${customers.filter((customer) => customer.grade === "A").length}곳`} tone="emerald" />
              <SummaryCard helper={hasOperationalLedger ? "방문 결과 기준" : "방문 기록 등록 후 집계"} label="예상매출" value={hasOperationalLedger ? `${expectedRevenue.toLocaleString()}만원` : "등록 후"} tone="violet" />
            </div>
            {dbError ? <p className="mt-2 rounded-md bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">원장 확인 메시지: {dbError}</p> : null}
            {!hasCustomers ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-900">
                  {customerSource === "loading" ? "거래처 원장을 불러오는 중입니다." : "실제 거래처 원장 데이터가 아직 연결되지 않았습니다."}
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-amber-800">
                  데이터 등록에서 거래처를 저장하면 지도 홈과 거래처 원장이 같은 기준으로 연결됩니다.
                </p>
                <Link className="maju-button-primary mt-3" href={withCompanyQuery("/?type=customer-master")}>
                  거래처 등록하기
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="maju-section-card">
          <SectionHeader eyebrow="거래처 작업" title="거래처 운영 현황" description="보완 대상부터 정리합니다." />
          <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm font-black text-slate-900">원장 완성도</p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <MiniLedgerMetric label="운영 가능" value={`${readyCustomerCount.toLocaleString()}곳`} tone="ready" />
                  <MiniLedgerMetric label="보완 필요" value={`${needsAttentionCount.toLocaleString()}곳`} tone="warning" />
                </div>
              </div>
              {addressMissingCount + businessNumberMissingCount + managerMissingCount > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  {[
                    { label: "주소 미등록", value: addressMissingCount },
                    { label: "사업자번호 미등록", value: businessNumberMissingCount },
                    { label: "담당자 미지정", value: managerMissingCount }
                  ].map((item) => (
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-amber-900" key={item.label}>
                      {item.label} {item.value.toLocaleString()}건
                    </span>
                  ))}
                </div>
              ) : (
                <p className="border-t border-slate-200 pt-3 text-xs font-black text-emerald-700">필수값 정상</p>
              )}
            </div>
            <Link className="flex items-center justify-between rounded-lg border border-teal-700 bg-teal-700 p-3 text-white shadow-sm transition hover:bg-teal-800" href={withCompanyQuery("/")}>
              <span>
                <span className="block text-sm font-black">거래처 데이터 보완</span>
                <span className="mt-1 block text-xs font-bold text-slate-300">엑셀/수기로 기준값 업데이트</span>
              </span>
              <Plus className="h-5 w-5 shrink-0" />
            </Link>
          </div>
          <div className="grid divide-y divide-slate-200 border-t border-slate-200/80 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="min-w-0 px-3 py-3">
              <p className="text-[11px] font-black uppercase text-slate-400">배송 담당자</p>
              <p className="mt-1 text-sm font-black text-slate-950">{managerCount.toLocaleString()}명</p>
            </div>
            <div className="min-w-0 px-3 py-3">
              <p className="text-[11px] font-black uppercase text-slate-400">적재위치 등록</p>
              <p className="mt-1 text-sm font-black text-slate-950">{loadingReadyCount.toLocaleString()}곳</p>
            </div>
            <div className="min-w-0 px-3 py-3">
              <p className="text-[11px] font-black uppercase text-slate-400">메모 이력</p>
              <p className="mt-1 text-sm font-black text-slate-950">{realMemoCount.toLocaleString()}건</p>
            </div>
          </div>
        </div>

        <div className="maju-section-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeader
              eyebrow="국세청 상태조회"
              title="사업자 상태·메모·첨부 현황"
              description="기본정보, 메모, 첨부자료를 한 표에서 봅니다."
            />
            <div className="no-print flex shrink-0 flex-wrap gap-1.5 p-3">
              <button className="maju-button-secondary h-8 text-xs" onClick={() => void downloadExcel()} type="button">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                엑셀
              </button>
              <button className="maju-button-secondary h-8 text-xs" onClick={downloadPdf} type="button">
                <Printer className="h-3.5 w-3.5" />
                PDF
              </button>
              <button className="maju-button-secondary h-8 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={isExportingImage} onClick={() => void downloadImage()} type="button">
                <ImageDown className="h-3.5 w-3.5" />
                {isExportingImage ? "생성 중" : "이미지"}
              </button>
            </div>
          </div>
          {exportMessage ? <p className="no-print mx-3 -mt-1 mb-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{exportMessage}</p> : null}
          <div className="no-print flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/60 p-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="maju-search-field lg:max-w-xs">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                onChange={(event) => {
                  setTableSearch(event.target.value);
                  setTablePage(1);
                }}
                placeholder="상호명, 대표자, 연락처, 사업자번호 검색"
                value={tableSearch}
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "정상", "휴업", "폐업", "확인 필요"] as const).map((status) => (
                <button
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-black transition ${
                    statusFilter === status
                      ? "border-teal-700 bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]"
                      : "border-transparent bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                  }`}
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setTablePage(1);
                  }}
                  type="button"
                >
                  {status === "all" ? "전체" : status} {statusCounts[status].toLocaleString()}
                </button>
              ))}
              <label className="ml-1 flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-500">
                보기
                <select
                  className="h-6 border-0 bg-transparent p-0 text-xs font-black text-slate-900 outline-none focus:ring-0"
                  onChange={(event) => {
                    setTablePageSize(Number(event.target.value) as ListPageSize);
                    setTablePage(1);
                  }}
                  value={tablePageSize}
                >
                  {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}개
                    </option>
                  ))}
                </select>
              </label>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">
                {tablePageStart.toLocaleString()}-{tablePageEnd.toLocaleString()} / {filteredRows.length.toLocaleString()}곳
              </span>
              <button
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentTablePage <= 1}
                onClick={() => setTablePage((page) => Math.max(1, page - 1))}
                type="button"
              >
                이전
              </button>
              <span className="px-1 text-xs font-black text-slate-400">
                {currentTablePage.toLocaleString()} / {tableTotalPages.toLocaleString()}
              </span>
              <button
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentTablePage >= tableTotalPages}
                onClick={() => setTablePage((page) => Math.min(tableTotalPages, page + 1))}
                type="button"
              >
                다음
              </button>
            </div>
          </div>
          <div className="bg-white" id="crm-summary-print-target" ref={exportTableRef}>
          <p className="print-only hidden px-3 pb-2 pt-3 text-sm font-black text-slate-950">거래처 전체 현황 · 사업자 상태·메모·첨부 현황</p>
          {filteredRows.length ? (
            <div className="grid grid-cols-[minmax(0,1.3fr)_100px_120px_120px_84px_minmax(0,1.4fr)_74px_74px] items-center gap-2 border-b border-slate-200/80 bg-slate-50/70 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <span>거래처명</span>
              <span>대표자명</span>
              <span>연락처</span>
              <span>사업자번호</span>
              <span className="text-center">상태</span>
              <span>메모</span>
              <span className="text-center">사업자등록증</span>
              <span className="text-center">적재위치</span>
            </div>
          ) : (
            <div className="m-3 rounded-md border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
              {customerSource === "loading" ? "거래처 원장을 불러오는 중입니다." : "조건에 맞는 거래처가 없습니다."}
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {pagedRows.map((customer) => {
              const summaryEntry = customer.id ? operationsSummary[customer.id] : undefined;
              const status = customer.businessStatus || "확인 필요";
              return (
                <Link
                  className="grid grid-cols-[minmax(0,1.3fr)_100px_120px_120px_84px_minmax(0,1.4fr)_74px_74px] items-center gap-2 px-3 py-2.5 transition hover:bg-slate-50"
                  href={withCompanyQuery(customer.id ? `/crm/timeline?customerId=${encodeURIComponent(customer.id)}` : "/crm/timeline")}
                  key={customer.id || customer.customerName}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-sm font-black text-slate-950">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{customer.customerName}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1">
                      <Badge className={`px-1.5 py-0 text-[10px] ${gradeClassName(customer.grade)}`}>{customer.grade}</Badge>
                      {customer.address ? <span className="truncate text-[11px] font-bold text-slate-400">{customer.address}</span> : null}
                    </span>
                  </span>
                  <span className="truncate text-xs font-bold text-slate-700">{customer.representativeName || "—"}</span>
                  <span className="truncate text-xs font-bold text-slate-700">{customer.phone || "—"}</span>
                  <span className="truncate text-xs font-bold text-slate-700">
                    {customer.businessNumber ? formatBusinessRegistrationNumber(customer.businessNumber) : "—"}
                  </span>
                  <span className="text-center">
                    <Badge className={`px-1.5 py-0 text-[10px] ${businessStatusToneClassName(status)}`}>{status}</Badge>
                  </span>
                  <span className="min-w-0 truncate text-xs font-bold text-slate-600">
                    {summaryEntry?.latestMemo ? (
                      <>
                        {summaryEntry.latestMemo}
                        {summaryEntry.memoCount > 1 ? <span className="ml-1 text-slate-400">외 {summaryEntry.memoCount - 1}건</span> : null}
                      </>
                    ) : (
                      <span className="text-slate-300">메모 없음</span>
                    )}
                  </span>
                  <span className="flex justify-center">
                    {customer.businessLicenseFileUrl ? (
                      <a
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 hover:bg-emerald-100"
                        href={customer.businessLicenseFileUrl}
                        onClick={(event) => event.stopPropagation()}
                        rel="noreferrer"
                        target="_blank"
                        title="사업자등록증 보기"
                      >
                        <FileBadge2 className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 text-slate-300 ring-1 ring-inset ring-slate-100" title="미등록">
                        <FileBadge2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                  <span className="flex justify-center">
                    {summaryEntry?.loadingPositionPhotoUrl ? (
                      <a
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100 hover:bg-teal-100"
                        href={summaryEntry.loadingPositionPhotoUrl}
                        onClick={(event) => event.stopPropagation()}
                        rel="noreferrer"
                        target="_blank"
                        title="적재위치 사진 보기"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 text-slate-300 ring-1 ring-inset ring-slate-100" title="미등록">
                        <ImageOff className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
          </div>
        </div>
      </section>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #crm-summary-print-target,
          #crm-summary-print-target * {
            visibility: visible;
          }
          #crm-summary-print-target {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print-only {
            display: block !important;
          }
        }
      `}</style>
    </CustomerAppShell>
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
