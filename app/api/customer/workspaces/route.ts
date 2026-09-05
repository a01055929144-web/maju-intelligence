import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession, setCustomerSession } from "@/lib/auth";
import { getCustomerWorkspaces } from "@/lib/store";
import { normalizeWorkspaceRole } from "@/lib/workspace";
import { workspaceRoleLabels, workspaceTypeLabels } from "@/lib/workspace";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await getCustomerWorkspaces({ email: session.email, userId: session.userId });

  return NextResponse.json({
    currentCompanyId: session.companyId,
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      isCurrent: workspace.companyId === session.companyId,
      roleLabel: workspaceRoleLabels[workspace.role],
      workspaceTypeLabel: workspaceTypeLabels[workspace.workspaceType]
    }))
  });
}

export async function POST(request: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const companyId = body?.companyId || "";
  const workspaces = await getCustomerWorkspaces({ email: session.email, userId: session.userId });
  const selected = workspaces.find((workspace) => workspace.companyId === companyId);
  if (!selected) {
    return NextResponse.json({ message: "선택할 수 없는 워크스페이스입니다." }, { status: 403 });
  }

  const workspaceRole = normalizeWorkspaceRole(selected.role);
  await setCustomerSession({
    ...session,
    companyId: selected.companyId,
    companyName: selected.companyName,
    role: workspaceRole === "owner" ? "owner" : "member",
    workspaceRole,
    workspaceType: selected.workspaceType
  });

  return NextResponse.json({ ok: true, companyId: selected.companyId });
}
