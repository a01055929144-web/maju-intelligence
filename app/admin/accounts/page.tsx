import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, KeyRound, ShieldAlert, Users } from "lucide-react";
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
      <AdminPageHeader active="accounts" badge="Account Control" session={session} subtitle="관리자 계정, 기본 고객사 계정, 회사별 계정의 역할을 분리해서 점검합니다" title="전역 계정 설정" />

      <section className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-3 md:grid-cols-3">
          <RoleCard
            description="어드민 콘솔에 접근하고 고객사, 업로드, 시스템 상태를 관리합니다."
            icon={ShieldAlert}
            label="관리자 계정"
            value={credentials.adminEmail}
          />
          <RoleCard
            description="운영 초기 또는 테스트용 기본 고객사 계정입니다. 실 고객사는 고객사 관리에서 별도로 만듭니다."
            icon={KeyRound}
            label="기본 고객사 계정"
            value={credentials.customerEmail}
          />
          <RoleCard
            description="회사별 이메일/비밀번호는 고객사 관리 화면에서 생성하고 수정합니다."
            icon={Users}
            label="회사별 고객사 계정"
            value="고객사 관리에서 처리"
          />
        </div>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 text-sm leading-6 text-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p>
                회사별 고객사 로그인 계정은 <strong>고객사 관리</strong>에서 생성/수정합니다. 이 화면은 운영 초기값과 전역 관리자 계정을 점검하는 보조 화면입니다.
              </p>
            </div>
            <Link className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-r from-teal-600 to-blue-600 px-3 text-xs font-black text-white shadow-[0_8px_18px_rgba(13,148,136,0.16)] transition hover:from-teal-700 hover:to-blue-700" href="/admin/companies">
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

function RoleCard({ description, icon: Icon, label, value }: { description: string; icon: typeof ShieldAlert; label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
        <p className="mt-3 text-xs font-semibold leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
