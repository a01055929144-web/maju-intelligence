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
    <main className="min-h-screen bg-[#eef1f4] px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Badge className="mb-2 w-fit bg-lime-100 text-slate-950 ring-1 ring-inset ring-lime-200">MAJU Workspace</Badge>
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">작업공간 선택</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">{session.email} 계정으로 사용할 회사를 선택하세요.</p>
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
