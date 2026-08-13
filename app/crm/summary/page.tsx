"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, FileBadge2, ImageOff, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
import { SectionHeader } from "@/components/section-header";

type TimelineItem = {
  id: string;
  expectedRevenue: number;
  result: string;
};

type DbSummary = {
  description: string;
  label: string;
  normalizedCustomers: number | null;
  tone: "ready" | "fallback";
  visitResults: number | null;
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

const defaultDbSummary: DbSummary = {
  description: "DB 상태를 확인 중입니다.",
  label: "DB 확인 중",
  normalizedCustomers: null,
  tone: "fallback",
  visitResults: null
};

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

function formatDbCount(value: number | null) {
  return value === null ? "확인 필요" : `${value.toLocaleString()}건`;
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

export default function CrmSummaryPage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const [dbSummary, setDbSummary] = useState<DbSummary>(defaultDbSummary);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [dbError, setDbError] = useState("");
  const [customers, setCustomers] = useState<CustomerSummaryRow[]>([]);
  const [customerSource, setCustomerSource] = useState<"loading" | "supabase" | "sample" | "error">("loading");
  const [operationsSummary, setOperationsSummary] = useState<Record<string, OperationsSummaryEntry>>({});
  const [tableSearch, setTableSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let active = true;

    fetch(withCompanyQuery("/api/customer/history-status"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        if (payload.dbSummary) setDbSummary(payload.dbSummary);
        setTimeline(Array.isArray(payload.timeline) ? payload.timeline : []);
        if (payload.errorMessage) setDbError(payload.errorMessage);
      })
      .catch(() => {
        if (!active) return;
        setDbError("DB 상태를 확인하지 못했습니다.");
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
      let source: "supabase" | "sample" | "error" = "sample";
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
          source = payload?.source === "sample" ? "sample" : "error";
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
    customerSource === "loading" ? "원장 확인 중" : hasOperationalLedger ? "DB 거래처 원장 연결" : "DB 거래처 원장 미연결";
  const ledgerStatusDescription = hasOperationalLedger
    ? "Supabase 거래처 원장 기준으로 목록과 상세를 표시합니다."
    : "데이터 등록에서 거래처 마스터를 저장하면 이 화면에 실제 원장이 표시됩니다.";
  const expectedRevenue = timeline.reduce((total, item) => total + item.expectedRevenue, 0);
  const addressMissingCount = customers.filter((customer) => !customer.address).length;
  const businessNumberMissingCount = customers.filter((customer) => !customer.businessNumber).length;
  const managerMissingCount = customers.filter((customer) => !customer.deliveryManager).length;
  const loadingReadyCount = customers.filter((customer) => Boolean(customer.loadingPosition)).length;
  const managerCount = new Set(customers.map((customer) => customer.deliveryManager).filter(Boolean)).size;
  const realMemoCount = customers.reduce((sum, customer) => sum + (customer.id ? operationsSummary[customer.id]?.memoCount || 0 : 0), 0);

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

  return (
    <CustomerAppShell
      active="customers"
      companyName={isAdminPreview ? "선택 고객사" : "마주식자재"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      subtitle="전체 거래처 기준값과 국세청 사업자상태, 메모·첨부 현황을 한 화면에서 확인합니다."
      title="거래처 전체 현황"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <section className="mx-auto max-w-[1560px] space-y-3">
        <div className="maju-section-card">
          <SectionHeader
            eyebrow="지도 작업공간"
            title="거래처 전체 현황"
            description="지도 홈이 사용하는 거래처 기준값입니다. 개별 거래처 수정은 거래처 관리에서 진행합니다."
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
              <SummaryCard helper="검색·상태 필터 적용 결과" label="표시 중" value={`${filteredRows.length}곳`} tone="blue" />
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
              filteredCount={filteredRows.length}
              loadingReadyCount={loadingReadyCount}
              managerMissingCount={managerMissingCount}
              managerCount={managerCount}
              memoCount={realMemoCount}
            />
          </div>
        </div>

        <div className="maju-section-card">
          <SectionHeader
            eyebrow="국세청 상태조회"
            title="사업자 상태·메모·첨부 현황"
            description="거래처명, 대표자명, 연락처, 사업자번호, 사업자 상태값, 메모, 사업자등록증, 적재위치 사진을 한 표에서 확인합니다."
          />
          <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/60 p-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="maju-search-field lg:max-w-xs">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="상호명, 대표자, 연락처, 사업자번호 검색"
                value={tableSearch}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "정상", "휴업", "폐업", "확인 필요"] as const).map((status) => (
                <button
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-black transition ${
                    statusFilter === status
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-transparent bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                  }`}
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {status === "all" ? "전체" : status} {statusCounts[status].toLocaleString()}
                </button>
              ))}
            </div>
          </div>
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
            {filteredRows.map((customer) => {
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
      </section>
    </CustomerAppShell>
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
    { label: "현재 필터", value: `${filteredCount.toLocaleString()}곳`, helper: "표시 중인 표 기준" },
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
      <div
        className={`grid gap-2 border-t px-3 py-3 text-xs font-bold leading-5 md:grid-cols-[160px_minmax(0,1fr)] md:items-center ${
          attentionTotal ? "border-amber-200 bg-amber-50/80 text-amber-900" : "border-emerald-100 bg-emerald-50/70 text-emerald-900"
        }`}
      >
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
