import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getAuthCredentials } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { AdminAccountsForm } from "./accounts-form";

export default async function AdminAccountsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const credentials = await getAuthCredentials();

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="accounts" badge="Account Control" session={session} subtitle="관리자 계정, 기본 고객사 계정, 회사별 계정의 역할을 분리해서 점검합니다" title="전역 계정 설정" />

      <section className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-4">
        <Card className="border-slate-200 bg-slate-950 text-white shadow-none">
          <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs font-black text-teal-300">
                <CheckCircle2 className="h-4 w-4" />
                전역 로그인 2개 등록됨
              </div>
              <h2 className="mt-2 text-xl font-black">지금 변경할 계정만 확인하세요</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-300">
                관리자·기본 고객사 계정은 아래에서 변경하고, 회사별 로그인은 고객사 관리에서 처리합니다.
              </p>
              <p className="mt-3 text-xs font-bold text-slate-400">마지막 저장 {credentials.updatedAt || "기록 없음"}</p>
            </div>
            <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-black text-white transition hover:bg-teal-500" href="/admin/companies">
              <Building2 className="h-4 w-4" />
              회사별 계정 관리
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <AccountStatusRow icon={ShieldAlert} label="관리자 계정" value={credentials.adminEmail} />
          <AccountStatusRow icon={KeyRound} label="기본 고객사 계정" value={credentials.customerEmail} />
        </div>

        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="flex gap-3 p-4 text-sm leading-6 text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              저장된 비밀번호와 해시는 화면에 표시하지 않습니다. 비밀번호를 변경할 때만 새 값을 입력하고,
              입력하지 않으면 현재 비밀번호가 유지됩니다.
            </p>
          </CardContent>
        </Card>

        <Card id="account-form">
          <CardHeader>
            <CardTitle>전역 로그인 계정 변경</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminAccountsForm
              initialCredentials={{
                adminEmail: credentials.adminEmail,
                adminPassword: "",
                customerEmail: credentials.customerEmail,
                customerPassword: "",
                customerCompanyId: credentials.customerCompanyId,
                updatedAt: credentials.updatedAt
              }}
            />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function AccountStatusRow({ icon: Icon, label, value }: { icon: typeof ShieldAlert; label: string; value: string }) {
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">등록됨</span>
      </CardContent>
    </Card>
  );
}
