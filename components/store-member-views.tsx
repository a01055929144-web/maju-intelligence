import Link from "next/link";
import type { ReactNode } from "react";
import { STORE_VIEWS, storeNavigationGroups, type StoreView } from "@/lib/store-navigation";
import type { StorePortalAccount, StorePortalOrder } from "@/lib/store/07-store-portal";
import { formatWon } from "@/domains/shared/money";
import { storeOrderStatusLabel } from "@/domains/order/store-order-status";
import { StoreAddressManagementPanel } from "./store-address-management-panel";
import { StoreInformationPanel } from "./store-information-panel";
import { StoreCostPanel } from "./store-cost-panel";
import { StoreOrderReceiptAction } from "./store-order-receipt-action";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { StoreOrderHistory } from "./store-order-history";
import { EmptyState, ErrorState } from "./ui/state";

const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const linkClass = "inline-flex min-h-11 items-center rounded-lg border px-3 underline";

export function StoreMemberViews({ account, deliveryPhotosEnabled = false, documentView, historyDetails, historyError, home, menu, orders, stores, view }: {
  account?: StorePortalAccount;
  deliveryPhotosEnabled?: boolean;
  documentView?: ReactNode;
  historyError: boolean;
  historyDetails: boolean;
  home: ReactNode;
  menu: string[];
  orders: StorePortalOrder[];
  stores: Array<{ key: string; name: string; href: string }>;
  view: StoreView;
}) {
  const items = storeNavigationGroups[0].items;
  const current = STORE_VIEWS.indexOf(view);
  const orderDocuments = account?.documents.filter(document => document.canOrder) ?? [];
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 pb-24 sm:pb-4">

      {stores.length > 1 && (
        <section aria-label="매장 고르기" className={account ? "space-y-2 sm:hidden" : "space-y-2"}>
          <h2 className="font-semibold">매장 고르기</h2>
          <div className="flex flex-wrap gap-2">
            {stores.map(store => <Link aria-current={account && store.key === `${account.companyId}:${account.storeAccountId}` ? "true" : undefined} className={linkClass} key={store.key} href={store.href}>{store.name}</Link>)}
          </div>
        </section>
      )}
      {account && (
        <section aria-label={items[current].label} className="space-y-4">
          <header>
            <p className="text-sm text-slate-600">{account.customerName}</p>
            <h2 className="text-xl font-semibold">{items[current].label}</h2>
          </header>
          {view === "home" && (documentView ?? home)}
          {view === "order" && (
            <Card>
              <CardHeader><CardTitle>주문 가능한 문서</CardTitle></CardHeader>
              <CardContent>
                {orderDocuments.length ? (
                  <ul className="space-y-2">{orderDocuments.map(document => <li key={document.href}><Link className={linkClass} href={document.href.replace("/store#", "/store?view=order#")}>{document.title} · 주문하기</Link></li>)}</ul>
                ) : <EmptyState bare message="아직 주문 가능한 단가표가 없습니다." description="담당자에게 단가표나 주문 링크를 요청해 주세요." />}
              </CardContent>
            </Card>
          )}
          {view === "history" && (
            <Card>
              <CardHeader><CardTitle>최근 주문</CardTitle></CardHeader>
              <CardContent>
                {historyError ? <ErrorState bare message="주문 내역을 불러오지 못했습니다." /> : orders.length ? historyDetails ? (
                  <StoreOrderHistory companyId={account.companyId} deliveryPhotosEnabled={deliveryPhotosEnabled} orders={orders} reorderHref={orderDocuments[0]?.href.replace("/store#", "/store?view=history#")} storeAccountId={account.storeAccountId} />
                ) : (
                  <ul className="divide-y">
                    {orders.map(order => (
                      <li className="py-3 text-sm" key={order.id}>
                        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                          <span>{date.format(new Date(order.submitted_at))} · 배송 {order.delivery_date || "미정"}</span>
                          <span>{storeOrderStatusLabel(order.status)} · {formatWon(order.known_total)}{order.has_market_price ? " + 시가" : ""}</span>
                        </div>
                        {order.document ? <details className="mt-3 rounded-lg border bg-white p-3" open={!order.document.receipt || order.document.receipt.revision !== order.document.revision}>
                          <summary className="cursor-pointer font-semibold">전표 {order.document.documentNumber} · {formatWon(order.document.totalAmount)}</summary>
                          <ul className="mt-3 space-y-1">{order.document.lines.map(line => <li className="flex justify-between gap-3" key={line.id}><span>{line.name}{line.specification ? ` · ${line.specification}` : ""} · {line.quantity}{line.unit}</span><span>{formatWon(line.unitPrice)} · {formatWon(line.lineAmount)}</span></li>)}</ul>
                          {order.document.receipt?.revision === order.document.revision ? <p className={`mt-3 rounded-lg px-3 py-2 font-semibold ${order.document.receipt.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{order.document.receipt.status === "confirmed" ? "이상 없음 확인됨" : "이상 있음 신고됨"} · {order.document.receipt.memberName} · {dateTime.format(new Date(order.document.receipt.confirmedAt))}{order.document.receipt.memo ? ` · ${order.document.receipt.memo}` : ""}</p> : order.status === "delivered" ? <>
                            {order.document.receipt ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-900">전표가 수정되어 다시 확인이 필요합니다.</p> : null}
                            <StoreOrderReceiptAction companyId={account.companyId} documentId={order.document.id} orderId={order.id} revision={order.document.revision} storeAccountId={account.storeAccountId} />
                          </> : <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">배송 완료 뒤 수령 확인할 수 있습니다.</p>}
                        </details> : null}
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState bare message="아직 주문 내역이 없습니다." />}
                {historyError && <a className={linkClass} href={menu[current]}>다시 시도</a>}
              </CardContent>
            </Card>
          )}
          {view === "data" && <div id="store-costs" className="space-y-2">
            <h3 className="font-semibold">매장 원가관리</h3>
            <StoreCostPanel access={account.hasCostAccess
              ? { companyId: account.companyId, storeAccountId: account.storeAccountId, canManage: account.canManageMembers }
              : { message: "이 매장에서는 원가관리를 이용할 수 없습니다." }} />
          </div>}
          {view === "info" && <>
            <StoreInformationPanel companyId={account.companyId} storeAccountId={account.storeAccountId}
              canManageAddress={account.canManageAddress} canManageMembers={account.canManageMembers} />
            {account.canManageAddress && <div id="store-address-management" className="scroll-mt-24">
              <StoreAddressManagementPanel companyId={account.companyId} storeAccountId={account.storeAccountId} />
            </div>}
          </>}
        </section>
      )}
      <nav aria-label="매장 메뉴" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {items.map((item, index) => <Link aria-current={index === current ? "page" : undefined} className={`flex min-h-11 items-center justify-center px-1 text-center text-xs font-semibold ${index === current ? "text-teal-800" : "text-slate-600"}`} href={menu[index]} key={item.active}>{item.label}</Link>)}
      </nav>
    </main>
  );
}
