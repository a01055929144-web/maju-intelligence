import { NextRequest, NextResponse } from "next/server";
import { recordInviteOpen } from "@/lib/store/07-store-signup-link";

// CX-142: 거래처 초대 링크를 열었다는 기록(익명, 횟수·시각만). 기능이 꺼진 회사·없는 토큰도 같은 응답이라 토큰 존재를 알려 주지 않는다.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "invalid");
    if (origin.host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase()) return new NextResponse(null, { status: 204 });
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    if (body && typeof body.token === "string") await recordInviteOpen(null, body.token).catch(() => false);
  } catch { /* 기록 실패는 개통 흐름을 막지 않는다 */ }
  return new NextResponse(null, { status: 204 });
}
