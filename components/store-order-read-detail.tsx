"use client";

import { formatWon } from "@/domains/shared/money";
import { storeOrderStatusLabel } from "@/domains/order/store-order-status";
import type { StorePortalOrder } from "@/lib/store/07-store-portal";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { Badge } from "./ui/badge";

export type StoreOrderDetailLine = { id?: string; product_name: string; specification?: string; sales_unit?: string; quantity: number;
  unit_price: number | null; total_amount: number | null; tax_type?: string };
const columns: CommonTableColumn<StoreOrderDetailLine>[] = [
  { key: "name", label: "품목", value: line => line.product_name, render: line => <span className="break-words">{line.product_name}
    {line.specification ? ` · ${line.specification}` : ""}{line.tax_type === "exempt" ? " · 면세" : line.tax_type === "taxable" ? " · 과세" : ""}</span> },
  { key: "quantity", label: "주문 수량", value: line => `${line.quantity}${line.sales_unit || "개"}` },
  { key: "price", label: "주문 단가", value: line => line.unit_price === null ? "단가 미정" : formatWon(line.unit_price) },
  { key: "amount", label: "주문 줄 금액", value: line => line.total_amount === null ? "금액 미정" : formatWon(line.total_amount) },
];

/** Present persisted values only. Order snapshots and confirmed documents are distinct records. */
export function StoreOrderReadDetail({ orderId, status, knownTotal, marketPricePending, lines, document, linkAccess = false }: {
  orderId: string; status: string; knownTotal: number; marketPricePending: boolean; lines: StoreOrderDetailLine[];
  document?: StorePortalOrder["document"]; linkAccess?: boolean;
}) {
  return <section aria-label="주문 상세 내용" className="min-w-0 space-y-3">
    <p className="flex flex-wrap items-center gap-2"><Badge>{storeOrderStatusLabel(status)}</Badge>
      <span>주문 금액 {formatWon(knownTotal)}{marketPricePending ? " + 시가 미정" : ""}</span></p>
    <p className="text-sm text-slate-600">주문 당시 수량과 서버에 기록된 금액입니다. 최종 출고 내역은 확정 전표를 확인해 주세요.</p>
    <CommonDataTable settingsKey="cx67-order-detail" columns={columns} rows={lines.map((line, index) => ({ ...line, id: String(index) }))} rowKey={line => line.id ?? line.product_name}
      selectable={false} numbered={false} phoneCards emptyMessage="주문 품목 정보가 없습니다. 유통사에 확인해 주세요." />
    <section aria-label="출고 상태" className="space-y-1 text-sm">
      <h3 className="font-semibold">출고 상태</h3>
      <p>{status === "in_delivery" ? "배송 중" : status === "delivered" ? "배송 완료" : status === "cancelled" ? "취소됨"
        : status === "submitted" || status === "received" ? "출고 확인 전" : "출고 상태 확인 필요"}</p>
      <p className="text-slate-600">줄별 출고·취소 수량은 현재 조회 정보에 포함되지 않습니다.</p>
    </section>
    <section aria-label="연결 전표" className="min-w-0 space-y-2 text-sm">
      <h3 className="font-semibold">연결 전표</h3>
      {document ? <details id={`order-document-${orderId}`}>
        <summary className="min-h-11 cursor-pointer break-words py-3 font-medium">확정 전표 {document.documentNumber} · {formatWon(document.totalAmount)}</summary>
        <p>전표 버전 {document.revision} · 확정 전표에 기록된 수량과 금액</p>
        <CommonDataTable settingsKey="cx67-order-document" columns={columns.map(column => ({ ...column, label: column.label.replace("주문", "전표") }))}
          rows={document.lines.map(line => ({ id: line.id, product_name: line.name, specification: line.specification, sales_unit: line.unit,
            quantity: line.quantity, unit_price: line.unitPrice, total_amount: line.lineAmount }))}
          rowKey={line => line.id ?? line.product_name} selectable={false} numbered={false} phoneCards
          emptyMessage="전표 품목 정보가 없습니다. 유통사에 확인해 주세요." />
      </details> : <p className="text-slate-600">{linkAccess ? "전표는 매장 전용 주문 내역에서 확인해 주세요."
        : "확인 가능한 확정 전표가 없습니다. 발행 상태는 유통사에 확인해 주세요."}</p>}
    </section>
  </section>;
}
