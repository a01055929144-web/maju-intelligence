import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { getStaffInvitationPreview } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const clientKey = createHash("sha256").update(clientAddress).digest("hex");
  const throttle = await consumeRequestRateLimit(`staff-invite-preview:${clientKey}`, { limit: 30 });
  if (!throttle.allowed) {
    return NextResponse.json(
      { message: `초대 확인 요청이 많습니다. ${throttle.retryAfterSeconds || 600}초 후 다시 시도해주세요.`, preview: null },
      { headers: { "Retry-After": String(throttle.retryAfterSeconds || 600) }, status: 429 }
    );
  }

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
