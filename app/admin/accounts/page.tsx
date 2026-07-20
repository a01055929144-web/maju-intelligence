import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getAuthCredentials } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { AdminAccountsForm } from "./accounts-form";

export default async function AdminAccountsPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const credentials = await getAuthCredentials();

  return (
    <main className="min-h-screen bg-background">
      <AdminPageHeader active="accounts" badge="Account Control" session={session} subtitle="관리자 기본 계정과 기본 고객사 계정값을 점검합니다" title="전역 계정 설정" />

      <section className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 text-sm leading-6 text-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p>
                회사별 고객사 로그인 계정은 <strong>고객사 선택·관리</strong>에서 생성/수정합니다. 이 화면은 운영 초기값과 전역 관리자 계정을 점검하는 보조 화면입니다.
              </p>
            </div>
            <Link className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800" href="/admin/companies">
              고객사별 계정 관리
            </Link>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="flex gap-3 p-4 text-sm leading-6 text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              초기 운영 편의를 위해 비밀번호를 관리자 화면에서 확인할 수 있게 저장합니다. 실제 고객사 배포 전에는 더 긴 비밀번호로 교체하고,
              추후에는 비밀번호 보기 대신 초기화 방식으로 바꾸는 것을 권장합니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>로그인 계정</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminAccountsForm initialCredentials={credentials} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
