import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getHoldModulesEnabledCompanyIds } from "@/lib/feature-modules";
import { getManagedCompanyAccounts } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { AdminCompaniesWorkspace } from "./workspace";

export default async function AdminCompaniesPage({
  searchParams
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [{ companyId }, payload] = await Promise.all([
    searchParams,
    getManagedCompanyAccounts().catch(() => {
      console.error("[admin/companies] managed_company_accounts_read_failed");
      return null;
    })
  ]);

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="companies" badge="Company Control" session={session} subtitle="회사별 로그인 계정과 거래처 데이터를 분리해서 운영합니다" title="고객사 관리" />

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-4 sm:px-4">
        <div className="flex justify-end">
          <Link className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800" href="/admin/companies/new">+ 고객사 기초 등록</Link>
        </div>
        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="flex gap-3 p-4 text-sm leading-6 text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              이 화면에서 만든 고객사는 고유한 회사 ID를 갖습니다. 고객사가 로그인하면 해당 회사 ID 기준으로 거래처, 매출, 배송 경로
              데이터가 분리되어 조회됩니다.
            </p>
          </CardContent>
        </Card>

        {payload ? (
          <AdminCompaniesWorkspace
            defaultCompanyId={process.env.CUSTOMER_COMPANY_ID || ""}
            holdModuleCompanyIds={Array.from(getHoldModulesEnabledCompanyIds())}
            initialCompanies={payload.companies}
            initialSelectedCompanyId={companyId}
            source={payload.source}
          />
        ) : (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="flex gap-3 p-6 text-sm leading-6 text-destructive">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">고객사 목록을 불러오지 못했습니다.</p>
                <p className="mt-1 text-muted-foreground">고객사 0건이 아니라 조회 실패 상태입니다. 잠시 후 새로고침하거나 시스템 점검을 확인해 주세요.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}
