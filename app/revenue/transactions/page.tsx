import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, BarChart3, CalendarDays, FileSpreadsheet, ReceiptText, Store, TrendingUp, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getSalesTransactions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RevenueTransactionsPage({ searchParams }: { searchParams?: { companyId?: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !searchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, searchParams?.companyId);
  const sales = await getSalesTransactions(companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);

  return (
    <CustomerAppShell
      active="revenue"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      rightAction={
        <>
          <Link className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50" href={companyId ? `/?companyId=${encodeURIComponent(companyId)}` : "/"}>
            매출 업로드
          </Link>
          <Link className="inline-flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-teal-600 to-blue-600 px-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(13,148,136,0.16)] transition hover:from-teal-700 hover:to-blue-700" href={customerSession ? "/dashboard" : "/admin/companies"}>
            돌아가기
          </Link>
        </>
      }
      subtitle="ERP 엑셀로 업로드된 일자·거래처·품목·금액 단위 원장입니다."
      title="매출 거래내역서"
      userName={customerSession?.name || "관리자"}
    >
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Banknote} label="총 매출금액" value={`${Math.round(sales.totalAmount).toLocaleString()}원`} />
          <Metric icon={ReceiptText} label="거래 행 수" value={`${sales.transactionCount.toLocaleString()}건`} />
          <Metric icon={Store} label="거래처 수" value={`${sales.customerCount.toLocaleString()}곳`} />
          <Metric icon={FileSpreadsheet} label="최근 매출일" value={sales.latestSalesDate || "-"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <Card className="shadow-none">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge className="mb-2 bg-emerald-50 text-emerald-700">거래처 매출 집중도</Badge>
                  <CardTitle>거래처별 매출 TOP</CardTitle>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">거래원장 업로드 기준으로 매출 기여도가 높은 거래처를 자동 정리합니다.</p>
                </div>
                <MiniStat label="평균 거래액" value={`${Math.round(sales.averageOrderAmount).toLocaleString()}원`} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {sales.topCustomers.length ? (
                sales.topCustomers.map((customer, index) => (
                  <RankedRevenueRow
                    key={customer.customerName}
                    badge={`${customer.grade}등급`}
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
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="shadow-none">
              <CardHeader>
                <Badge className="mb-2 w-fit bg-blue-50 text-blue-700">품목 이탈 감지 기준</Badge>
                <CardTitle>품목별 매출 구조</CardTitle>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">품목별 매출 비중을 보고 이탈·감소 품목을 추적할 수 있습니다.</p>
              </CardHeader>
              <CardContent className="space-y-3">
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
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>운영 체크포인트</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <InsightRow icon={UploadCloud} label="업로드 방식" value="ERP 거래원장 반복 업데이트" />
                <InsightRow icon={CalendarDays} label="분석 기준" value={sales.latestSalesDate ? `${sales.latestSalesDate} 최신 매출일` : "업로드 후 자동 갱신"} />
                <InsightRow icon={TrendingUp} label="다음 개선" value="월별 증감, 품목 이탈, 거래처 등급 변동 추적" />
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>최근 거래내역</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-black text-slate-500">
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
                {sales.items.map((item) => (
                  <tr key={item.id} className="font-bold text-slate-800">
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
                    <td className="px-3 py-12 text-center text-sm font-bold text-slate-500" colSpan={7}>
                      아직 업로드된 매출 거래내역이 없습니다. 매출 거래내역서를 업로드하면 이곳에 누적됩니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </CustomerAppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <Icon className="mb-4 h-5 w-5 text-primary" />
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-black">{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-right">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function RankedRevenueRow({
  badge,
  index,
  label,
  meta,
  share,
  value
}: {
  badge?: string;
  index: number;
  label: string;
  meta: string;
  share: number;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-teal-500 to-blue-600 text-xs font-black text-white">{index}</span>
            <p className="truncate text-sm font-black text-slate-950">{label}</p>
            {badge ? <Badge className="bg-emerald-100 text-emerald-800">{badge}</Badge> : null}
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
    <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">{message}</div>;
}
