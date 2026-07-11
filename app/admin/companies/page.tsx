import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getManagedCompanyAccounts } from "@/lib/store";
import { AdminCompaniesWorkspace } from "./workspace";

export default async function AdminCompaniesPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const payload = await getManagedCompanyAccounts();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">
              <Building2 className="mr-1 h-3.5 w-3.5" />
              Company Control
            </Badge>
            <h1 className="text-2xl font-black">고객사 생성/수정</h1>
            <p className="mt-1 text-sm text-muted-foreground">회사별 로그인 계정과 거래처 데이터를 분리해서 운영합니다.</p>
          </div>
          <div className="flex gap-2">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
              href="/admin/accounts"
            >
              관리자 계정
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              href="/admin"
            >
              관리자 홈
            </Link>
          </div>
        </div>
      </header>

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
