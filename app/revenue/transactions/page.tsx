import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, BarChart3, CalendarDays, FileSpreadsheet, ReceiptText, Store, TrendingUp, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SalesTransactionMatcher } from "@/components/sales-transaction-matcher";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getSalesTransactions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RevenueTransactionsPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const sales = await getSalesTransactions(companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const hasSalesData = sales.transactionCount > 0;
  const salesSignals = [
    {
      actionHref: companyId ? `/?companyId=${encodeURIComponent(companyId)}` : "/",
      actionLabel: "매출 업로드",
      description: hasSalesData ? `${sales.transactionCount.toLocaleString()}건의 거래내역이 원장에 누적되어 있습니다.` : "ERP 매출 거래내역서를 업로드하면 거래처별, 품목별 분석이 시작됩니다.",
      label: "원장 적재",
      ready: hasSalesData,
      value: hasSalesData ? `${sales.transactionCount.toLocaleString()}건` : "업로드 필요"
    },
    {
      actionHref: companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline",
      actionLabel: "거래처 확인",
      description: sales.unmatchedCustomerCount
        ? `${sales.unmatchedCustomerCount.toLocaleString()}곳이 거래처 원장과 매칭되지 않았습니다. 상호명·사업자번호를 확인하세요.`
        : "매출 거래처가 모두 거래처 원장과 연결되어 있습니다.",
      label: "거래처 연결",
      ready: hasSalesData && sales.unmatchedCustomerCount === 0,
      value: hasSalesData ? `매칭 ${sales.matchRate}%` : "업로드 필요"
    },
    {
      actionHref: companyId ? `/revenue/pipeline?companyId=${encodeURIComponent(companyId)}` : "/revenue/pipeline",
      actionLabel: "파이프라인 보기",
      description: sales.topProducts.length ? "품목별 매출 비중을 기반으로 이탈·감소 품목을 추적할 수 있습니다." : "품목 컬럼이 포함된 거래원장을 올리면 품목 이탈 분석이 가능합니다.",
      label: "품목 분석",
      ready: sales.topProducts.length > 0,
      value: sales.topProducts.length ? `${sales.topProducts.length}개 품목` : "품목 필요"
    }
  ];

  return (
    <CustomerAppShell
      active="revenue-ledger"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      rightAction={
        <Link className="maju-button-primary" href={companyId ? `/?companyId=${encodeURIComponent(companyId)}` : "/"}>
          원장 업로드
        </Link>
      }
      subtitle="ERP 거래원장 기준으로 거래처·품목·금액을 확인합니다."
      title="매출 거래내역"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4 sm:px-6">
        <div className="maju-section-card">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">매출 원장 현황</p>
              <p className="mt-1 maju-muted-label">업로드된 거래원장 기준</p>
            </div>
            <Badge className={hasSalesData ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {hasSalesData ? "원장 적재 완료" : "매출 원장 필요"}
            </Badge>
          </div>
          <div className="grid md:grid-cols-4">
            <Metric icon={Banknote} label="총 매출금액" value={`${Math.round(sales.totalAmount).toLocaleString()}원`} />
            <Metric icon={ReceiptText} label="거래 행 수" value={`${sales.transactionCount.toLocaleString()}건`} />
            <Metric icon={Store} label="거래처 수" value={`${sales.customerCount.toLocaleString()}곳`} />
            <Metric icon={FileSpreadsheet} label="최근 매출일" value={sales.latestSalesDate || "-"} />
          </div>
        </div>

        <div className="grid maju-section-card lg:grid-cols-3">
          {salesSignals.map((signal) => (
            <SalesSignalCard key={signal.label} {...signal} />
          ))}
        </div>

        <RevenueDataBasisPanel
          customerCount={sales.customerCount}
          latestSalesDate={sales.latestSalesDate || "업로드 후 확인"}
          productCount={sales.topProducts.length}
          transactionCount={sales.transactionCount}
          totalAmount={sales.totalAmount}
        />

        <SalesTransactionMatcher companyId={companyId} unmatchedGroups={sales.unmatchedGroups} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <section className="maju-section-card">
            <div className="maju-card-header">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge className="mb-2 bg-emerald-100 text-emerald-800">거래처 매출 집중도</Badge>
                  <h2 className="text-lg font-black text-slate-950">거래처별 매출</h2>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">매출 기여도가 높은 거래처 순서입니다.</p>
                </div>
                <MiniStat label="평균 거래액" value={`${Math.round(sales.averageOrderAmount).toLocaleString()}원`} />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {sales.topCustomers.length ? (
                sales.topCustomers.map((customer, index) => (
                  <RankedRevenueRow
                    key={customer.customerId || customer.customerName}
                    badge={customer.matched ? `${customer.grade}등급` : "미매칭"}
                    badgeTone={customer.matched ? "emerald" : "amber"}
                    index={index + 1}
                    label={customer.customerName}
                    meta={`${customer.transactionCount.toLocaleString()}건 · 최근 ${customer.latestSalesDate || "-"}`}
                    share={customer.share}
                    value={`${Math.round(customer.totalAmount).toLocaleString()}원`}
                  />
                ))
              ) : (
                <EmptyPanel message="거래처별 매출 분석을 위해 매출 거래내역서를 업로드하세요." />
              )}
            </div>
          </section>

          <div className="space-y-4">
            <section className="maju-section-card">
              <div className="maju-card-header">
                <Badge className="mb-2 w-fit bg-blue-50 text-blue-700">품목 이탈 감지 기준</Badge>
                <h2 className="text-lg font-black text-slate-950">품목별 매출</h2>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">품목 비중과 감소 가능성을 봅니다.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {sales.topProducts.length ? (
                  sales.topProducts.map((product, index) => (
                    <RankedRevenueRow
                      key={product.productName}
                      index={index + 1}
                      label={product.productName}
                      meta={`${product.transactionCount.toLocaleString()}건`}
                      share={product.share}
                      value={`${Math.round(product.totalAmount).toLocaleString()}원`}
                    />
                  ))
                ) : (
                  <EmptyPanel message="품목 컬럼이 포함된 거래원장을 업로드하면 품목별 구조가 표시됩니다." />
                )}
              </div>
            </section>

            <section className="maju-section-card">
              <div className="maju-card-header">
                <h2 className="text-lg font-black text-slate-950">운영 체크포인트</h2>
              </div>
              <div className="grid gap-2 p-4">
                <InsightRow icon={UploadCloud} label="업로드 방식" value="ERP 거래원장 반복 업데이트" />
                <InsightRow icon={CalendarDays} label="분석 기준" value={sales.latestSalesDate ? `${sales.latestSalesDate} 최신 매출일` : "업로드 후 자동 갱신"} />
                <InsightRow icon={TrendingUp} label="다음 개선" value="월별 증감, 품목 이탈, 거래처 등급 변동 추적" />
              </div>
            </section>
          </div>
        </div>

        <section className="maju-section-card">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">원장 테이블</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">최근 업로드 행</p>
            </div>
            <Badge className="bg-slate-900 text-white">{sales.items.length.toLocaleString()}행 표시</Badge>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="text-left text-xs font-black text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-3 text-center">No</th>
                  <th className="border-b border-slate-200 px-3 py-3">매출일</th>
                  <th className="border-b border-slate-200 px-3 py-3">거래처</th>
                  <th className="border-b border-slate-200 px-3 py-3">사업자번호</th>
                  <th className="border-b border-slate-200 px-3 py-3">품목</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">수량</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">매출금액</th>
                  <th className="border-b border-slate-200 px-3 py-3">적재시각</th>
                </tr>
              </thead>
              <tbody>
                {sales.items.map((item, index) => (
                  <tr key={item.id} className="font-bold text-slate-800 odd:bg-white even:bg-slate-50/60 hover:bg-teal-50/70">
                    <td className="border-b border-slate-100 px-3 py-3 text-center text-xs text-slate-400">{index + 1}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{item.salesDate || "-"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{item.customerName}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{item.businessRegistrationNumber || "-"}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{item.productName || "-"}</td>
                    <td className="border-b border-slate-100 px-3 py-3 text-right">{item.quantity.toLocaleString()}</td>
                    <td className="border-b border-slate-100 px-3 py-3 text-right text-primary">{Math.round(item.salesAmount).toLocaleString()}원</td>
                    <td className="border-b border-slate-100 px-3 py-3 text-xs text-slate-500">{item.createdAt}</td>
                  </tr>
                ))}
                {!sales.items.length ? (
                  <tr>
                    <td className="px-3 py-12 text-center text-sm font-bold text-slate-500" colSpan={8}>
                      아직 업로드된 매출 거래내역이 없습니다. 매출 거래내역서를 업로드하면 이곳에 누적됩니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </CustomerAppShell>
  );
}

function RevenueDataBasisPanel({
  customerCount,
  latestSalesDate,
  productCount,
  transactionCount,
  totalAmount
}: {
  customerCount: number;
  latestSalesDate: string;
  productCount: number;
  transactionCount: number;
  totalAmount: number;
}) {
  const items = [
    { label: "매출 원장", value: `${transactionCount.toLocaleString()}건`, helper: "ERP 거래내역 기준" },
    { label: "거래처 연결", value: `${customerCount.toLocaleString()}곳`, helper: "거래처 원장 매칭 기준" },
    { label: "품목 기준", value: `${productCount.toLocaleString()}개`, helper: "품목 이탈 분석 기준" },
    { label: "최근 매출일", value: latestSalesDate, helper: "기간 분석 기준" },
    { label: "누적 매출", value: `${Math.round(totalAmount).toLocaleString()}원`, helper: "등급·리포트 기준" }
  ];

  return (
    <div className="maju-section-card">
      <div className="grid gap-3 border-b border-slate-200/80 bg-slate-50/70 px-5 py-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
        <div>
          <p className="maju-section-title">운영 기준 데이터</p>
          <p className="mt-1 maju-muted-label normal-case tracking-normal">매출 원장이 대시보드와 AI 리포트에 반영되는 기준값입니다.</p>
        </div>
        <p className="text-xs font-bold leading-5 text-slate-600">
          거래처 마스터와 매출 거래내역의 사업자번호 또는 상호명·주소가 맞아야 거래처별 매출, 등급, 품목 이탈 분석이 정확해집니다.
        </p>
      </div>
      <div className="grid divide-y divide-slate-100 md:grid-cols-5 md:divide-x md:divide-y-0">
        {items.map((item) => (
          <div className="min-w-0 px-4 py-3" key={item.label}>
            <p className="maju-muted-label">{item.label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950" title={item.value}>
              {item.value}
            </p>
            <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{item.helper}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <div className="border-b border-slate-200/80 p-5 md:border-b-0 md:border-r last:md:border-r-0">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="maju-muted-label">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="maju-stat-card min-w-[150px] text-right">
      <p className="maju-muted-label">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function SalesSignalCard({
  actionHref,
  actionLabel,
  description,
  label,
  ready,
  value
}: {
  actionHref: string;
  actionLabel: string;
  description: string;
  label: string;
  ready: boolean;
  value: string;
}) {
  return (
    <div className={`border-b border-slate-200/80 p-4 lg:border-b-0 lg:border-r last:lg:border-r-0 ${ready ? "bg-emerald-50/40" : "bg-amber-50/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="maju-muted-label">{label}</p>
          <p className="mt-1 truncate text-xl font-black text-slate-950">{value}</p>
        </div>
        <Badge className={ready ? "bg-white text-emerald-800 ring-1 ring-inset ring-emerald-100" : "bg-white text-amber-800 ring-1 ring-inset ring-amber-100"}>
          {ready ? "준비" : "확인"}
        </Badge>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{description}</p>
      <Link className="maju-button-secondary mt-4" href={actionHref}>
        {actionLabel}
      </Link>
    </div>
  );
}

function RankedRevenueRow({
  badge,
  badgeTone = "emerald",
  index,
  label,
  meta,
  share,
  value
}: {
  badge?: string;
  badgeTone?: "emerald" | "amber";
  index: number;
  label: string;
  meta: string;
  share: number;
  value: string;
}) {
  return (
    <div className="bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-xs font-black text-white">{index}</span>
            <p className="truncate text-sm font-black text-slate-950">{label}</p>
            {badge ? <Badge className={badgeTone === "amber" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>{badge}</Badge> : null}
          </div>
          <p className="mt-1 text-xs font-bold text-muted-foreground">{meta}</p>
        </div>
        <p className="shrink-0 text-right text-sm font-black text-primary">{value}</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, share))}%` }} />
        </div>
        <span className="w-12 text-right text-xs font-black text-slate-600">{share}%</span>
      </div>
    </div>
  );
}

function InsightRow({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return (
    <div className="maju-stat-card flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <p className="maju-muted-label">{label}</p>
        <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="maju-empty-state m-4 text-sm font-bold text-slate-500">{message}</div>;
}
