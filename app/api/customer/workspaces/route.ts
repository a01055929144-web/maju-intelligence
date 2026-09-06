import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession, setCustomerSession } from "@/lib/auth";
import { getCustomerWorkspaces, leaveCustomerWorkspace } from "@/lib/store";
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
      roleLabel: workspaceRoleLabels[normalizeWorkspaceRole(workspace.role)],
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
  }, { remember: true });

  return NextResponse.json({ ok: true, companyId: selected.companyId });
}

export async function DELETE(request: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const companyId = body?.companyId || "";
  if (!companyId) {
    return NextResponse.json({ message: "나갈 워크스페이스 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await leaveCustomerWorkspace(
      { userId: session.userId || "", companyId },
      { actorName: session.name, actorRole: session.workspaceRole }
    );

    // 지금 로그인해서 쓰던 워크스페이스를 나간 경우, 남은 워크스페이스 중 하나로 세션을 바로
    // 전환합니다. 남은 워크스페이스가 없으면 다음 요청 때 인증이 만료된 것처럼 처리되어
    // 자연스럽게 로그인 화면으로 이동합니다.
    let switchedTo: string | undefined;
    if (session.companyId === companyId) {
      const remaining = await getCustomerWorkspaces({ email: session.email, userId: session.userId });
      const next = remaining[0];
      if (next) {
        const workspaceRole = normalizeWorkspaceRole(next.role);
        await setCustomerSession(
          {
            ...session,
            companyId: next.companyId,
            companyName: next.companyName,
            role: workspaceRole === "owner" ? "owner" : "member",
            workspaceRole,
            workspaceType: next.workspaceType
          },
          { remember: true }
        );
        switchedTo = next.companyId;
      }
    }

    return NextResponse.json({ ok: true, ...result, switchedTo });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "워크스페이스 나가기에 실패했습니다." }, { status: 400 });
  }
}
