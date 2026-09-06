import { NextRequest, NextResponse } from "next/server";
import { clearCustomerSession, getCustomerSession } from "@/lib/auth";
import { closeCompanyAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

// 고객사 탈퇴(회사 계정 전체 삭제)는 대표(owner)만 할 수 있습니다. manage_members/manage_billing
// 같은 일반 capability와 달리, 회사를 완전히 닫는 조작이라 관리자(manager)에게도 열어주지
// 않습니다.
export async function POST(request: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.workspaceRole !== "owner") {
    return NextResponse.json({ message: "회사 탈퇴는 대표(오너) 권한이 있는 계정만 할 수 있습니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { confirmCompanyName?: string } | null;
  if (!body?.confirmCompanyName?.trim()) {
    return NextResponse.json({ message: "확인을 위해 회사명을 정확히 입력해주세요." }, { status: 400 });
  }

  try {
    const result = await closeCompanyAccount(
      { companyId: session.companyId, confirmCompanyName: body.confirmCompanyName },
      { actorName: session.name, actorRole: session.workspaceRole }
    );
    // 탈퇴 처리 후 바로 로그아웃시켜, 닫힌 회사로 계속 화면을 조작할 수 없게 합니다.
    await clearCustomerSession();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "회사 탈퇴 처리에 실패했습니다." }, { status: 400 });
  }
}
