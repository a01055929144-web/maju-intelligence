import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import {
  createStaffInvitation,
  getCompanyStaffInvitations,
  StaffInvitationInput,
  StaffInvitationUpdateInput,
  updateStaffInvitation
} from "@/lib/store";

export const dynamic = "force-dynamic";

function requireMemberManager() {
  const session = getCustomerSession();
  if (!session) return { response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }), session: null };
  return { response: null, session };
}

export async function GET() {
  const { response, session } = requireMemberManager();
  if (response || !session) return response;

  return NextResponse.json(await getCompanyStaffInvitations(session.companyId));
}

export async function POST(request: NextRequest) {
  const { response, session } = requireMemberManager();
  if (response || !session) return response;

  const body = (await request.json().catch(() => null)) as Omit<StaffInvitationInput, "companyId"> | null;
  if (!body?.employeeName) {
    return NextResponse.json({ message: "직원명은 필수입니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await createStaffInvitation({
        companyId: session.companyId,
        employeeName: body.employeeName,
        employeePhone: body.employeePhone,
        role: body.role
      })
    );
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "직원 추가에 실패했습니다." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const { response, session } = requireMemberManager();
  if (response || !session) return response;

  const body = (await request.json().catch(() => null)) as Omit<StaffInvitationUpdateInput, "companyId"> | null;
  if (!body?.invitationId) {
    return NextResponse.json({ message: "직원 초대 ID가 필요합니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await updateStaffInvitation({
        companyId: session.companyId,
        invitationId: body.invitationId,
        role: body.role,
        status: body.status
      })
    );
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "직원 권한 변경에 실패했습니다." }, { status: 400 });
  }
}
