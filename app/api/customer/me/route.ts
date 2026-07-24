import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { getWorkspaceCapabilities, workspaceRoleLabels, workspaceTypeLabels } from "@/lib/workspace";

export async function GET() {
  const session = getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const workspaceRole = session.workspaceRole || (session.role === "owner" ? "owner" : "member");
  const workspaceType = session.workspaceType || "company";

  return NextResponse.json({
    session: {
      ...session,
      appRole: session.appRole || "customer_user",
      workspaceRole,
      workspaceRoleLabel: workspaceRoleLabels[workspaceRole],
      workspaceType,
      workspaceTypeLabel: workspaceTypeLabels[workspaceType]
    },
    capabilities: getWorkspaceCapabilities(workspaceRole)
  });
}
