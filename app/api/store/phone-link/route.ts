import { NextRequest, NextResponse } from "next/server";
import { getStoreSession } from "@/lib/auth";
import { confirmPhoneLink, declinePhoneLink } from "@/lib/store/07-store-phone-link";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** CX-146: 로그인한 점주가 번호로 찾은 매장을 확인(연결) 또는 거절한다. 번호는 서버가 app_users에서 읽고, 요청·응답에는 나오지 않는다. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  const session = await getStoreSession();
  if (!session) return NextResponse.json({ message: "카카오로 로그인해 주세요." }, { status: 401, headers: noStore });
  const body = (await request.json().catch(() => null)) as { action?: unknown; customerIds?: unknown } | null;
  const ids = Array.isArray(body?.customerIds) ? body.customerIds : [];
  if ((body?.action !== "confirm" && body?.action !== "decline") || ids.length < 1 || ids.length > 50 || !ids.every(id => typeof id === "string" && UUID.test(id)))
    return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400, headers: noStore });
  try {
    if (body.action === "decline") return NextResponse.json({ declined: await declinePhoneLink(session.authUserId, ids as string[]) }, { headers: noStore });
    const result = await confirmPhoneLink(session.authUserId, ids as string[]);
    return NextResponse.json({ linked: result.linked.length, conflicts: result.conflicts }, { headers: noStore });
  } catch {
    return NextResponse.json({ message: "연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: noStore });
  }
}
