import Link from "next/link";
import { formatWon } from "@/domains/shared/money";
import { storeOrderStatusLabel, type StoreOrderStatus } from "@/domains/order/store-order-status";
import type { StorePortalOrder } from "@/lib/store/07-store-portal";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });
const steps: Array<{ status: StoreOrderStatus; label: string }> = [
  { status: "submitted", label: "접수 대기" },
  { status: "received", label: "접수" },
  { status: "in_delivery", label: "배송 중" },
  { status: "delivered", label: "배송 완료" },
];

export function StoreOrderHistory({ orders, reorderHref }: { orders: StorePortalOrder[]; reorderHref?: string }) {
  return (
    <div className="space-y-3">
      {reorderHref && (
        <Link href={reorderHref} className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium">
          주문 링크에서 다시 담기
        </Link>
      )}
      <table className="block w-full text-sm md:table">
        <thead className="sr-only md:not-sr-only">
          <tr className="border-b text-left text-slate-600">
            <th scope="col" className="py-2 pr-3">주문일</th>
            <th scope="col" className="py-2 pr-3">배송일</th>
            <th scope="col" className="py-2 pr-3">품목 수</th>
            <th scope="col" className="py-2 pr-3">금액</th>
            <th scope="col" className="py-2">상태</th>
          </tr>
        </thead>
        {orders.map(order => {
          const current = steps.findIndex(step => step.status === order.status);
          const lines = order.lines ?? [];
          return (
            <tbody className="block border-b last:border-b-0 md:table-row-group" key={order.id}>
              <tr className="grid grid-cols-2 gap-x-3 gap-y-2 pt-3 md:table-row">
                <td className="md:py-2 md:pr-3"><span className="block text-slate-600 md:hidden">주문일</span>
                  {dateFormat.format(new Date(order.submitted_at))}</td>
                <td className="md:py-2 md:pr-3"><span className="block text-slate-600 md:hidden">배송일</span>
                  {order.delivery_date ? dateFormat.format(new Date(order.delivery_date)) : "미정"}</td>
                <td className="tabular-nums md:py-2 md:pr-3"><span className="block text-slate-600 md:hidden">품목 수</span>{lines.length}개</td>
                <td className="tabular-nums md:py-2 md:pr-3"><span className="block text-slate-600 md:hidden">금액</span>
                  {formatWon(order.known_total)}{order.has_market_price ? " + 시가" : ""}</td>
                <td className="font-medium md:py-2"><span className="block font-normal text-slate-600 md:hidden">상태</span>
                  {steps[current]?.label ?? storeOrderStatusLabel(order.status)}</td>
              </tr>
              <tr className="block md:table-row">
                <td colSpan={5} className="block pb-2 md:table-cell">
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 font-medium text-teal-800">주문 상세</summary>
                    <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
                      {current >= 0 && (
                        <ol aria-label="배송 단계" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {steps.map((step, index) => (
                            <li key={step.status} aria-current={index === current ? "step" : undefined}
                              className={index === current ? "font-semibold text-teal-800" : "text-slate-600"}>
                              {step.label}{index === current ? " (현재)" : ""}
                            </li>
                          ))}
                        </ol>
                      )}
                      {lines.length ? (
                        <ul className="divide-y">
                          {lines.map(line => (
                            <li key={line.id} className="flex flex-wrap justify-between gap-x-2 gap-y-1 py-2">
                              <span><span className="font-medium">{line.product_name}</span>
                                {line.specification ? <span className="ml-2 text-slate-600">{line.specification}</span> : null}
                              </span>
                              <span className="tabular-nums">{line.quantity} {line.sales_unit} · {line.total_amount === null ? "시가" : formatWon(line.total_amount)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-slate-600">표시할 품목이 없습니다.</p>}
                      {order.status === "delivered" && (
                        <section aria-label="수령 확인" id={`receipt-${order.id}`} className="space-y-1 border-t pt-3">
                          <h3 className="font-medium">수령 확인</h3>
                          <p className="text-slate-600">빠진 품목이 있으면 유통사에 문의해 주세요.</p>
                        </section>
                      )}
                    </div>
                  </details>
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
