import { redirect } from "next/navigation";
import { Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceSelectionPanel } from "@/components/workspace-selection-panel";
import { getCustomerSession } from "@/lib/auth";
import { getCustomerWorkspaces } from "@/lib/store";

export default async function WorkspacesPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");

  const workspaces = await getCustomerWorkspaces({ email: session.email, userId: session.userId });
  if (workspaces.length <= 1) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-[#eef1f4] px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Badge className="mb-2 w-fit bg-lime-100 text-slate-950 ring-1 ring-inset ring-lime-200">로그인 완료 · 2단계</Badge>
            <h1 className="text-2xl font-bold tracking-[-0.04em] text-slate-950 sm:text-3xl">오늘 운영할 회사를 선택하세요</h1>
            <p className="mt-1 break-all text-sm font-medium leading-5 text-slate-500">{session.email} 계정으로 참여 중인 회사 작업공간입니다.</p>
          </div>
          <Badge className="w-fit bg-white px-3 py-1.5 text-slate-700 ring-1 ring-inset ring-slate-200">{workspaces.length}개 작업공간</Badge>
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <WorkspaceSelectionPanel currentCompanyId={session.companyId} workspaces={workspaces} />
          </CardContent>
        </Card>
        <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600 sm:grid-cols-3">
          <p className="flex gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />회사별 데이터는 서로 섞이지 않습니다.</p>
          <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />표시된 역할에 맞는 메뉴만 열립니다.</p>
          <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />선택하면 운영 대시보드로 이동합니다.</p>
        </div>
      </div>
    </main>
  );
}
