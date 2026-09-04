import { NextRequest, NextResponse } from "next/server";
import { getStaffInvitationPreview } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const inviteCode = request.nextUrl.searchParams.get("invite")?.trim() || "";
  if (!inviteCode) {
    return NextResponse.json({ message: "초대 코드가 필요합니다.", preview: null }, { status: 400 });
  }

  try {
    const preview = await getStaffInvitationPreview(inviteCode);
    if (!preview) {
      return NextResponse.json({ message: "유효하지 않은 초대 코드입니다.", preview: null }, { status: 404 });
    }
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "초대 정보를 확인하지 못했습니다.";
    return NextResponse.json({ message, preview: null }, { status: 500 });
  }
}
