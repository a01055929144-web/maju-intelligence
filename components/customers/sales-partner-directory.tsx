"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { CommonTableColumn } from "@/components/common-data-table";
import { SalesPartnerPanel } from "@/components/customers/sales-partner-panels";
import { PartnerDirectory } from "@/components/partners/partner-directory";
import type { PartnerRow } from "@/domains/partner/directory";

// CC-73: 매출처(거래처) 화면을 공용 거래처 틀(PartnerDirectory)에 올린 어댑터. 기존 원장·기록 화면은 지우지 않고 틀의 탭에서 이어 준다(Strangler).
export type SalesPartnerSource = {
  readonly id?: string;
  readonly address: string;
  readonly businessNumber?: string;
  readonly businessStatus?: string;
  readonly customerName: string;
  readonly email?: string;
  readonly grade: "A" | "B" | "C";
  readonly industry: string;
  readonly lastOrderDays: number;
  readonly memoCount: number;
  readonly monthlyRevenue: number;
  readonly phone?: string;
  readonly region: string;
  readonly representativeName?: string;
  readonly businessName?: string;
  readonly subBusinessNumber?: string;
};

type Row = PartnerRow & { source: SalesPartnerSource; grade: string };

/** "n일 전 주문" → 날짜(한국 시간). 값이 없거나 비정상이면 비움. */
export function lastTradeDateFromDays(days: number, now: Date = new Date()): string | undefined {
  if (!Number.isFinite(days) || days < 0 || days > 3650) return undefined;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(now.getTime() - days * 86_400_000));
}

export function SalesPartnerDirectory({ companyId = "", customers, query }: { companyId?: string; customers: readonly SalesPartnerSource[]; query: (path: string, customerId?: string) => string }) {
  const rows = useMemo<Row[]>(() => customers.flatMap((customer) => customer.id ? [{
    id: customer.id, displayName: customer.customerName, businessName: customer.businessName, subBusinessNumber: customer.subBusinessNumber, businessNumber: customer.businessNumber, representativeName: customer.representativeName, phone: customer.phone,
    lastTradeDate: lastTradeDateFromDays(customer.lastOrderDays), monthAmount: customer.monthlyRevenue > 0 ? customer.monthlyRevenue * 10000 : null,
    status: customer.businessStatus === "closed" ? "폐업" : customer.businessStatus === "suspended" ? "휴업" : "거래중", grade: customer.grade, source: customer
  }] : []), [customers]);
  // 매출처에서만 기본으로 보이는 열(등급 · 업종).
  const extraColumns = useMemo<CommonTableColumn<Row>[]>(() => [
    { key: "grade", label: "등급", value: (row) => row.grade, sortable: true, priority: 2 },
    { key: "industry", label: "업종", value: (row) => row.source.industry, sortable: true, priority: 3 }
  ], []);
  const tabs = useMemo(() => ({
    info: (row: Row) => (
      <div className="space-y-2 text-sm">
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_1fr]">
          <dt className="font-bold text-slate-500">주소</dt><dd>{row.source.address || "-"}</dd>
          <dt className="font-bold text-slate-500">연락처</dt><dd>{row.source.phone || "-"}</dd>
          <dt className="font-bold text-slate-500">이메일</dt><dd>{row.source.email || "-"}</dd>
          <dt className="font-bold text-slate-500">업종</dt><dd>{row.source.industry || "-"}</dd>
        </dl>
        <Link className="maju-button-secondary inline-flex min-h-11 px-3 text-xs sm:min-h-9" href={query("/crm/timeline?section=ledger", row.id)}>원장에서 수정</Link>
      </div>
    ),
    items: (row: Row) => <SalesPartnerPanel companyId={companyId} customerId={row.id} customerName={row.displayName} view="products" />,
    memo: (row: Row) => (
      <p className="text-sm text-slate-700">메모·상담 기록 {row.source.memoCount.toLocaleString("ko-KR")}건 <Link className="ml-2 font-bold text-teal-700 underline" href={query("/crm/timeline?section=history", row.id)}>기록 열기</Link></p>
    )
  }), [companyId, query]);
  // 영업 기능(타임라인 · 지도)은 매출처 상세의 추가 탭으로 남긴다.
  const extraTabs = useMemo(() => [
    { id: "sales", label: "영업 기록", render: (row: Row) => <Link className="maju-button-secondary inline-flex min-h-11 px-3 text-xs sm:min-h-9" href={query("/crm/timeline?section=history", row.id)}>영업 타임라인 열기</Link> },
    { id: "map", label: "지도", render: () => <Link className="maju-button-secondary inline-flex min-h-11 px-3 text-xs sm:min-h-9" href={query("/map")}>지도에서 보기</Link> }
  ], [query]);
  return <><div className="mb-3 flex justify-end"><Link className="maju-button-secondary inline-flex min-h-11 items-center px-3 text-sm" href={query("/partners/new-stores")}>새 매장 확인</Link></div><PartnerDirectory companyId={companyId} extraColumns={extraColumns} extraTabs={extraTabs} partnerType="customer" registerHref={query("/partners/register?type=customer")} rows={rows} tabs={tabs} uploadHref={query("/")} /></>;
}
