import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { createStaffAccountDirect, DirectStaffAccountInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as DirectStaffAccountInput | null;
  if (!body?.companyId) {
    return NextResponse.json({ message: "고객사 ID가 필요합니다." }, { status: 400 });
  }
  if (!body.employeeName?.trim()) {
    return NextResponse.json({ message: "직원 이름을 입력해주세요." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await createStaffAccountDirect(body, {
        actorName: session.name,
        actorRole: session.appRole
      })
    );
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "직원 계정 생성에 실패했습니다." }, { status: 400 });
  }
}
