import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { getWorkspaceCapabilities, workspaceRoleLabels, workspaceTypeLabels } from "@/lib/workspace";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getCompanySettings } from "@/lib/store";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const workspaceRole = session.workspaceRole || (session.role === "owner" ? "owner" : "member");
  const workspaceType = session.workspaceType || "company";

  // 11/3: 회사명을 바꾸면 로그인 정보(쿠키)의 회사명은 예전 값이라, 화면 표시는 DB 최신값을 씁니다.
  const companyName = await getCompanySettings(session.companyId, session.companyName).then((company) => company.name).catch(() => session.companyName);

  return NextResponse.json({
    companyName,
    session: {
      ...session,
      appRole: session.appRole || "customer_user",
      workspaceRole,
      workspaceRoleLabel: workspaceRoleLabels[workspaceRole],
      workspaceType,
      workspaceTypeLabel: workspaceTypeLabels[workspaceType]
    },
    capabilities: getWorkspaceCapabilities(workspaceRole),
    features: {
      pricing: isFeatureEnabled("PRICING", session.companyId),
      storeOrdering: isFeatureEnabled("STORE_ORDERING", session.companyId)
    }
  });
}
