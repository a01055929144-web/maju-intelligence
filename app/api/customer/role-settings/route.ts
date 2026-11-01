import { NextRequest, NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { supabaseRequest } from "@/lib/store";
import { isRoleGroupKey, normalizeRolePermissionOverrides } from "@/domains/organization/role-settings";

export const dynamic = "force-dynamic";

function disabled() {
  return process.env.ROLE_PERMISSIONS_ENABLED !== "true";
}

async function managerSession() {
  const session = await getCustomerSession();
  if (!session) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!session.userId || !customerHasCapability(session, "manage_members")) {
    return { error: NextResponse.json({ message: "직원 권한을 관리할 권한이 없습니다." }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  if (disabled()) return NextResponse.json({ message: "권한 묶음 기능은 준비 중입니다." }, { status: 404 });
  const auth = await managerSession();
  if (auth.error) return auth.error;
  const { session } = auth;
  const members = await supabaseRequest<Array<{
    permission_group_key: string | null;
    permission_overrides: unknown;
    role: string;
    user_id: string;
  }>>(`company_members?select=user_id,role,permission_group_key,permission_overrides&company_id=eq.${encodeURIComponent(session.companyId)}&status=eq.active&order=created_at.asc`);
  const ids = members.map((member) => member.user_id);
  const users = ids.length
    ? await supabaseRequest<Array<{ email: string | null; id: string; name: string | null }>>(`app_users?select=id,name,email&id=in.(${ids.join(",")})`)
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));
  return NextResponse.json({
    currentUserId: session.userId,
    members: members.map((member) => ({
      email: userById.get(member.user_id)?.email || "",
      groupKey: isRoleGroupKey(member.permission_group_key) ? member.permission_group_key : member.role === "owner" ? "owner" : member.role === "manager" ? "manager" : member.role === "driver" ? "delivery" : member.role === "sales" ? "sales" : "sales",
      name: userById.get(member.user_id)?.name || "이름 미등록 직원",
      overrides: normalizeRolePermissionOverrides(member.permission_overrides),
      userId: member.user_id
    }))
  });
}

export async function POST(request: NextRequest) {
  if (disabled()) return NextResponse.json({ message: "권한 묶음 기능은 준비 중입니다." }, { status: 404 });
  const auth = await managerSession();
  if (auth.error) return auth.error;
  const { session } = auth;
  const body = await request.json().catch(() => null) as { groupKey?: unknown; overrides?: unknown; targetUserIds?: unknown } | null;
  const targetUserIds = Array.isArray(body?.targetUserIds)
    ? Array.from(new Set(body.targetUserIds.filter((value): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))))
    : [];
  if (!isRoleGroupKey(body?.groupKey) || targetUserIds.length === 0 || targetUserIds.length > 100) {
    return NextResponse.json({ message: "적용할 사람과 권한 묶음을 확인해주세요." }, { status: 400 });
  }
  const overrides = normalizeRolePermissionOverrides(body?.overrides);
  try {
    await supabaseRequest("rpc/apply_role_settings_batch_v1", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        p_actor_user_id: session.userId,
        p_company_id: session.companyId,
        p_overrides: overrides,
        p_role_key: body.groupKey,
        p_target_user_ids: targetUserIds
      })
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "권한 일괄 적용에 실패했습니다.";
    const protectedTarget = /owner_|minimum_owner|self_mixed/.test(message);
    return NextResponse.json({ message: protectedTarget ? "대표 자신의 권한은 다른 사람과 함께 바꿀 수 없고, 대표 권한은 대표만 변경할 수 있습니다." : "권한 일괄 적용에 실패했습니다." }, { status: protectedTarget ? 403 : 500 });
  }
}
