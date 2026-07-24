import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { createStaffInvitation, StaffInvitationInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as StaffInvitationInput | null;
  if (!body?.companyId) {
    return NextResponse.json({ message: "고객사 ID가 필요합니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(await createStaffInvitation(body));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "직원 초대 생성에 실패했습니다." }, { status: 400 });
  }
}
