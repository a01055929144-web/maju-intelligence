import { NextRequest, NextResponse } from "next/server";
import { getStoreSession } from "@/lib/auth";
import { createStoreProfile, listStoreProfiles, storeDirectSignupEnabled } from "@/lib/store/11-store-direct-signup";
import { parseStoreProfileInput } from "../../../../domains/store/store-profile";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === request.nextUrl.origin;
}

/** 로그인한 카카오 사용자 본인의 매장 프로필. 플래그가 꺼져 있으면 존재하지 않는 것처럼 404. */
export async function GET() {
  if (!storeDirectSignupEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const session = await getStoreSession();
  if (!session) return NextResponse.json({ message: "카카오로 로그인해 주세요." }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ profiles: await listStoreProfiles(session.authUserId) }, { headers: noStore });
  } catch {
    return NextResponse.json({ message: "매장 정보를 불러오지 못했습니다." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  if (!storeDirectSignupEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  const session = await getStoreSession();
  if (!session) return NextResponse.json({ message: "카카오로 로그인해 주세요." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null);
  const parsed = parseStoreProfileInput(body);
  if (!parsed.ok) return NextResponse.json({ message: parsed.message, field: parsed.field }, { status: 400, headers: noStore });
  try {
    // 같은 사용자가 두 번 눌러도 매장이 둘 생기지 않게, 이미 활성 매장이 있으면 새로 만들지 않는다.
    if ((await listStoreProfiles(session.authUserId)).length) return NextResponse.json({ message: "이미 가입한 매장이 있습니다." }, { status: 409, headers: noStore });
    const created = await createStoreProfile(session.authUserId, parsed.value);
    return NextResponse.json({ storeProfileId: created.storeProfileId }, { status: 201, headers: noStore });
  } catch {
    return NextResponse.json({ message: "가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: noStore });
  }
}
