import { redirect } from "next/navigation";
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
    <main className="min-h-screen maju-app-bg px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Badge className="mb-2 w-fit bg-primary/10 text-primary">MAJU Workspace</Badge>
            <h1 className="text-3xl font-black tracking-normal text-slate-950">작업공간 선택</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">{session.email} 계정으로 접근 가능한 개인·회사 공간입니다.</p>
          </div>
          <Badge className="w-fit bg-white px-3 py-1.5 text-slate-700 ring-1 ring-inset ring-slate-200">{workspaces.length}개 작업공간</Badge>
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <WorkspaceSelectionPanel currentCompanyId={session.companyId} workspaces={workspaces} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
