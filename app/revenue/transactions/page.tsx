import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, FileSpreadsheet, ReceiptText, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getSalesTransactions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RevenueTransactionsPage({ searchParams }: { searchParams?: { companyId?: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");

  const companyId = customerSession?.companyId || searchParams?.companyId;
  const sales = await getSalesTransactions(companyId);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">Revenue Ledger</Badge>
            <h1 className="text-2xl font-black">매출 거래내역서</h1>
            <p className="mt-1 text-sm text-muted-foreground">ERP 엑셀로 업로드된 일자·거래처·품목·금액 단위 원장입니다.</p>
          </div>
          <div className="flex gap-2">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
              href={companyId ? `/?companyId=${encodeURIComponent(companyId)}` : "/"}
            >
              매출 업로드
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              href={customerSession ? "/dashboard" : "/admin/companies"}
            >
              돌아가기
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Banknote} label="총 매출금액" value={`${Math.round(sales.totalAmount).toLocaleString()}원`} />
          <Metric icon={ReceiptText} label="거래 행 수" value={`${sales.transactionCount.toLocaleString()}건`} />
          <Metric icon={Store} label="거래처 수" value={`${sales.customerCount.toLocaleString()}곳`} />
          <Metric icon={FileSpreadsheet} label="최근 매출일" value={sales.latestSalesDate || "-"} />
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
    </main>
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
