import { NextRequest, NextResponse } from "next/server";
import { getStoreSession } from "@/lib/auth";
import { checkLoginThrottle, clearLoginThrottle, recordLoginFailure } from "@/lib/rate-limit";
import { connectStoreProfile, listStoreProfiles, storeDirectSignupEnabled } from "@/lib/store/11-store-direct-signup";
import { hashInviteCode } from "../../../../lib/store/11-invite-code-hash";
import { normalizeInviteCode } from "../../../../domains/store/invite-code";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
// 없는/만료/회수/형식 오류 모두 같은 문구: 어느 쪽인지 알려 주면 코드를 추측하는 데 쓰인다.
const INVALID = "코드를 확인할 수 없습니다. 유통사에서 받은 코드를 다시 확인해 주세요.";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === request.nextUrl.origin;
}

/** 로그인한 점주가 유통사 초대코드를 입력해 그 유통사와 연결한다. 어떤 유통사인지는 코드가 정하고, 목록·검색은 없다. */
export async function POST(request: NextRequest) {
  if (!storeDirectSignupEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  const session = await getStoreSession();
  if (!session) return NextResponse.json({ message: "카카오로 로그인해 주세요." }, { status: 401, headers: noStore });

  // 실패를 5번 하면 10분 잠긴다(DB 기반, 서버리스 인스턴스가 여럿이어도 유지).
  const key = `store-invite:${session.authUserId}`;
  const throttle = await checkLoginThrottle(key);
  if (!throttle.allowed) return NextResponse.json({ message: `시도가 많아 잠시 제한되었습니다. ${throttle.retryAfterSeconds}초 후 다시 시도해 주세요.` }, { status: 429, headers: noStore });

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? normalizeInviteCode(body.code) : null;
  if (!code) { await recordLoginFailure(key); return NextResponse.json({ message: INVALID }, { status: 400, headers: noStore }); }

  try {
    // 연결할 프로필은 항상 로그인한 본인의 점주 프로필. 요청에서 받지 않는다.
    const profile = (await listStoreProfiles(session.authUserId)).find((item) => item.role === "owner");
    if (!profile) return NextResponse.json({ message: "먼저 매장 정보를 입력해 주세요." }, { status: 409, headers: noStore });
    const result = await connectStoreProfile(session.authUserId, profile.id, hashInviteCode(code));
    if (!result.ok) {
      await recordLoginFailure(key);
      return result.reason === "not_owner"
        ? NextResponse.json({ message: "점주만 유통사를 연결할 수 있습니다." }, { status: 403, headers: noStore })
        : NextResponse.json({ message: INVALID }, { status: 400, headers: noStore });
    }
    await clearLoginThrottle(key);
    // 응답에 유통사 이름·ID를 싣지 않는다(화면은 새로고침으로 연결된 매장을 읽는다).
    return NextResponse.json({ linked: true, alreadyLinked: result.alreadyLinked }, { status: result.alreadyLinked ? 200 : 201, headers: noStore });
  } catch {
    return NextResponse.json({ message: "연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: noStore });
  }
}
