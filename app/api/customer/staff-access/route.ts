import { NextRequest, NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { supabaseRequest } from "@/lib/store";
import {
  canGrantStaffPermission,
  normalizeStaffDuties,
  normalizeStaffPermissionRole,
  validateStaffAccess
} from "@/domains/organization/staff-access";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.STAFF_ACCESS_V2_ENABLED !== "true") return NextResponse.json({ records: [] });
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!customerHasCapability(session, "manage_members")) {
    return NextResponse.json({ message: "직원 권한을 조회할 권한이 없습니다." }, { status: 403 });
  }
  const rows = await supabaseRequest<Array<{
    assigned_vehicle: string | null;
    duties: unknown;
    id: string;
    membership_expires_at: string | null;
    permission_role: string | null;
  }>>(
    `staff_invitations?select=id,permission_role,duties,membership_expires_at,assigned_vehicle&company_id=eq.${encodeURIComponent(session.companyId)}&order=created_at.desc`
  );
  return NextResponse.json({
    records: rows.map((row) => ({
      duties: normalizeStaffDuties(row.duties),
      expiresOn: row.membership_expires_at?.slice(0, 10) || null,
      invitationId: row.id,
      permissionRole: normalizeStaffPermissionRole(row.permission_role),
      vehicleName: row.assigned_vehicle || ""
    }))
  });
}

export async function PATCH(request: NextRequest) {
  if (process.env.STAFF_ACCESS_V2_ENABLED !== "true") {
    return NextResponse.json({ message: "직원 권한·업무 분리 기능은 준비 중입니다." }, { status: 404 });
  }
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!session.userId) return NextResponse.json({ message: "직원 계정 식별자가 없습니다." }, { status: 400 });
  if (!customerHasCapability(session, "manage_members")) {
    return NextResponse.json({ message: "직원 권한을 변경할 권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    duties?: unknown;
    expiresOn?: string | null;
    invitationId?: string;
    permissionRole?: unknown;
    vehicleName?: string | null;
  } | null;
  if (!body?.invitationId) return NextResponse.json({ message: "직원 초대 ID가 필요합니다." }, { status: 400 });

  const duties = normalizeStaffDuties(body.duties);
  const permissionRole = normalizeStaffPermissionRole(body.permissionRole);
  const error = validateStaffAccess({ duties, expiresOn: body.expiresOn, permissionRole, vehicleId: body.vehicleName });
  if (error) return NextResponse.json({ message: error }, { status: 400 });
  if (!canGrantStaffPermission(session.workspaceRole === "owner" ? "owner" : "manager", permissionRole)) {
    return NextResponse.json({ message: "대표 권한은 기존 대표만 부여할 수 있습니다." }, { status: 403 });
  }

  const rows = await supabaseRequest<Array<{ accepted_by: string | null; id: string }>>(
    `staff_invitations?select=id,accepted_by&id=eq.${encodeURIComponent(body.invitationId)}&company_id=eq.${encodeURIComponent(session.companyId)}&limit=1`
  );
  const invitation = rows[0];
  if (!invitation) return NextResponse.json({ message: "직원 초대 정보를 찾을 수 없습니다." }, { status: 404 });

  const expiresAt = permissionRole === "temporary" && body.expiresOn ? `${body.expiresOn}T14:59:59.999Z` : null;
  await supabaseRequest("rpc/update_staff_access_v2", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      p_actor_is_maju_admin: false,
      p_actor_user_id: session.userId,
      p_assigned_vehicle: body.vehicleName?.trim() || null,
      p_company_id: session.companyId,
      p_duties: duties,
      p_invitation_id: invitation.id,
      p_membership_expires_at: expiresAt,
      p_permission_role: permissionRole
    })
  });
  return NextResponse.json({ saved: true });
}
