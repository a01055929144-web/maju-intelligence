import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getManagedCompanyAccounts } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { AdminCompaniesWorkspace } from "./workspace";

export default async function AdminCompaniesPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const payload = await getManagedCompanyAccounts();

  return (
    <main className="min-h-screen bg-slate-50">
      <AdminPageHeader active="companies" badge="Company Control" session={session} subtitle="회사별 로그인 계정과 거래처 데이터를 분리해서 운영합니다" title="고객사 생성/수정" />

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="flex gap-3 p-4 text-sm leading-6 text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              이 화면에서 만든 고객사는 고유한 회사 ID를 갖습니다. 고객사가 로그인하면 해당 회사 ID 기준으로 거래처, 매출, 배송 경로
              데이터가 분리되어 조회됩니다.
            </p>
          </CardContent>
        </Card>

        <AdminCompaniesWorkspace initialCompanies={payload.companies} source={payload.source} />
      </section>
    </main>
  );
}
