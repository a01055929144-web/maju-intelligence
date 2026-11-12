"use client";

import { useEffect, useMemo, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import type { SalesHistoryRow, SalesProductRow } from "@/domains/customer/sales-activity";

// CC-25: 매출처 "매출 상품"·"거래내역" 탭(읽기 전용). 매입처 탭(product-supplier-workspace)과 같은 공용 표.
type Activity = { products: SalesProductRow[]; history: SalesHistoryRow[] };
const money = (value: number | null | undefined) => (value == null ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`);
const KIND_LABEL = { sale: "매출 전표", order: "매장 주문", receipt: "입금" } as const;
const SOURCE_TONE = { 기본: "bg-slate-100 text-slate-600", 매장: "bg-teal-50 text-teal-700", 견적: "bg-amber-50 text-amber-700" } as const;

export function SalesPartnerPanel({ companyId = "", customerId, customerName, view }: { companyId?: string; customerId?: string; customerName?: string; view: "products" | "history" }) {
  const [state, setState] = useState<{ key: string; data?: Activity; error?: string }>({ key: "" });
  const key = customerId ? `${customerId}|${companyId}` : "";
  useEffect(() => {
    if (!customerId) return;
    let live = true;
    fetch(`/api/customers/${customerId}/sales-activity${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "거래 내역을 불러오지 못했습니다.");
        if (live) setState({ key, data: payload as Activity });
      })
      .catch((error) => { if (live) setState({ key, error: error instanceof Error ? error.message : "거래 내역을 불러오지 못했습니다." }); });
    return () => { live = false; };
  }, [customerId, companyId, key]);
  const loading = Boolean(key) && state.key !== key;
  const productColumns = useMemo<CommonTableColumn<SalesProductRow>[]>(() => [
    { key: "name", label: "매출 상품", value: (row) => row.name, sortable: true },
    { key: "unit", label: "단위", value: (row) => row.unit || "-" },
    { key: "last", label: "최근 단가", value: (row) => row.lastUnitPrice ?? "", render: (row) => money(row.lastUnitPrice), align: "right", sortable: true },
    { key: "qty", label: "수량", value: (row) => row.quantity, render: (row) => row.quantity.toLocaleString("ko-KR"), align: "right", sortable: true },
    { key: "date", label: "마지막 거래일", value: (row) => row.lastDate, sortable: true },
    { key: "current", label: "지금 적용 가격", value: (row) => row.currentPrice ?? "", render: (row) => money(row.currentPrice), align: "right", sortable: true },
    { key: "source", label: "출처", value: (row) => row.source ?? "", render: (row) => (row.source ? <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${SOURCE_TONE[row.source]}`}>{row.source}</span> : <span className="text-slate-400">-</span>) },
  ], []);
  const historyColumns = useMemo<CommonTableColumn<SalesHistoryRow>[]>(() => [
    { key: "date", label: "날짜", value: (row) => row.date, sortable: true },
    { key: "kind", label: "구분", value: (row) => KIND_LABEL[row.kind] },
    { key: "label", label: "내용", value: (row) => row.label },
    { key: "amount", label: "금액", value: (row) => row.amount ?? "", render: (row) => money(row.amount), align: "right", sortable: true },
    { key: "status", label: "상태", value: (row) => row.status },
  ], []);
  const title = view === "products" ? "매출 상품" : "거래내역";
  return (
    <section className="maju-section-card">
      <div className="maju-card-header">
        <h2 className="maju-section-title">{title}</h2>
        <p className="mt-1 maju-muted-label">{customerId ? `${customerName || "선택한 매출처"} · ${view === "products" ? "매출 전표와 매장 주문을 상품별로 합쳤습니다." : "매출 전표·주문·입금을 날짜순으로 봅니다."}` : "목록에서 매출처를 먼저 고르세요."}</p>
      </div>
      <div className="border-t border-slate-100 p-4">
        {view === "products"
          ? <CommonDataTable columns={productColumns} emptyMessage="이 매출처의 매출 상품이 아직 없습니다." error={state.error} filename="매출상품.csv" loading={loading} rowKey={(row) => row.key} rows={state.data?.products ?? []} settingsKey="sales-partner-products" />
          : <CommonDataTable columns={historyColumns} emptyMessage="이 매출처의 거래내역이 아직 없습니다." error={state.error} filename="거래내역.csv" loading={loading} rowKey={(row) => row.id} rows={state.data?.history ?? []} settingsKey="sales-partner-history" />}
      </div>
    </section>
  );
}
