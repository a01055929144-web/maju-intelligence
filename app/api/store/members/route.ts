import { NextRequest, NextResponse } from "next/server";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { createStoreMemberInvitation, createStoreProfileMemberInvitation, listStoreMembers, listStoreProfileMembers, removeStoreMember, removeStoreProfileMember } from "@/lib/store/07-store-member-management";
import { getStorePublicBaseUrl } from "@/lib/store/07-store-owner-provisioning";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase(); }
  catch { return false; }
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("companyId") || "";
    const storeAccountId = request.nextUrl.searchParams.get("storeAccountId") || "";
    if (!uuid.test(companyId) || !uuid.test(storeAccountId))
      return NextResponse.json({ message: "매장 정보를 확인해 주세요." }, { status: 400 });
    if (!isStoreMemberCompanyAllowlisted(companyId))
      return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
    const member = await getStoreMemberContext({ companyId, storeAccountId });
    if (!member || (member.role !== "owner" && member.role !== "manager"))
      return NextResponse.json({ message: "구성원을 볼 권한이 없습니다." }, { status: 403 });
    const profileMode = isFeatureEnabled("STORE_PROFILE_INVITATIONS", member.companyId);
    return NextResponse.json({ actorMemberId: member.memberId, actorRole: member.role, profileMode,
      members: profileMode ? await listStoreProfileMembers({ companyId: member.companyId, storeAccountId: member.storeAccountId })
        : await listStoreMembers({ companyId: member.companyId, storeAccountId: member.storeAccountId }) },
    { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "구성원 목록을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    if (!uuid.test(String(body.companyId)) || !uuid.test(String(body.storeAccountId)) ||
      (body.role !== "manager" && body.role !== "staff")) return NextResponse.json({ message: "초대 정보를 확인해 주세요." }, { status: 400 });
    if (!isStoreMemberCompanyAllowlisted(String(body.companyId))) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
    const member = await getStoreMemberContext({ companyId: String(body.companyId), storeAccountId: String(body.storeAccountId) });
    if (!member || (member.role !== "owner" && member.role !== "manager") || (body.role === "manager" && member.role !== "owner"))
      return NextResponse.json({ message: "구성원을 초대할 권한이 없습니다." }, { status: 403 });
    const origin = getStorePublicBaseUrl();
    if (!origin) return NextResponse.json({ message: "구성원 초대가 아직 준비되지 않았습니다." }, { status: 503 });
    const profileMode = isFeatureEnabled("STORE_PROFILE_INVITATIONS", member.companyId);
    if (profileMode && member.role !== "owner") return NextResponse.json({ message: "점주만 구성원을 초대할 수 있습니다." }, { status: 403 });
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 100) : "";
    if (profileMode && !displayName) return NextResponse.json({ message: "초대할 사람 이름을 입력해 주세요." }, { status: 400 });
    const token = profileMode ? await createStoreProfileMemberInvitation({ authUserId: member.authUserId, companyId: member.companyId,
      displayName, role: body.role, storeAccountId: member.storeAccountId }) : await createStoreMemberInvitation({ actorMemberId: member.memberId,
      companyId: member.companyId, role: body.role, storeAccountId: member.storeAccountId });
    const inviteUrl = new URL("/store/member-invite", origin);
    inviteUrl.hash = token;
    return NextResponse.json({ inviteUrl: inviteUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "구성원 초대를 만들지 못했습니다." }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    if (!uuid.test(String(body.companyId)) || !uuid.test(String(body.storeAccountId)) || !uuid.test(String(body.targetMemberId)))
      return NextResponse.json({ message: "구성원 정보를 확인해 주세요." }, { status: 400 });
    if (!isStoreMemberCompanyAllowlisted(String(body.companyId))) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
    const member = await getStoreMemberContext({ companyId: String(body.companyId), storeAccountId: String(body.storeAccountId) });
    if (!member || (member.role !== "owner" && member.role !== "manager"))
      return NextResponse.json({ message: "구성원을 내보낼 권한이 없습니다." }, { status: 403 });
    if (isFeatureEnabled("STORE_PROFILE_INVITATIONS", member.companyId)) {
      if (member.role !== "owner") return NextResponse.json({ message: "점주만 구성원을 내보낼 수 있습니다." }, { status: 403 });
      await removeStoreProfileMember({ authUserId: member.authUserId, companyId: member.companyId,
        storeAccountId: member.storeAccountId, targetMemberId: String(body.targetMemberId) });
    } else await removeStoreMember({ actorMemberId: member.memberId, companyId: member.companyId,
      storeAccountId: member.storeAccountId, targetMemberId: String(body.targetMemberId) });
    return NextResponse.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "구성원을 내보내지 못했습니다." }, { status: 409 });
  }
}
