import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getAuthCredentials } from "@/lib/store";
import { AdminAccountsForm } from "./accounts-form";

export default async function AdminAccountsPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const credentials = await getAuthCredentials();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">
              <KeyRound className="mr-1 h-3.5 w-3.5" />
              Account Control
            </Badge>
            <h1 className="text-2xl font-black">고객사 계정 관리</h1>
            <p className="mt-1 text-sm text-muted-foreground">관리자와 고객사 로그인 계정을 확인하고 수정합니다.</p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
            href="/admin"
          >
            관리자 홈
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="flex gap-3 p-4 text-sm leading-6 text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              MVP 운영 편의를 위해 비밀번호를 관리자 화면에서 확인할 수 있게 저장합니다. 현장 데모 후에는 더 긴 비밀번호로 교체하고,
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
