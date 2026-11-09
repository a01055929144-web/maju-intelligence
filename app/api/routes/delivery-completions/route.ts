import { NextRequest, NextResponse } from "next/server";
import { completeOrderDelivery, DeliveryCompletionError } from "@/application/delivery/complete-order-delivery";
import type { OrderDeliveryCompletionCommand } from "@/application/delivery/order-delivery-completion-command";
import { isLegacyDeliveryOwner } from "@/domains/organization/staff-access";
import { getCustomerAssignmentKeys, getCustomerOperationalName, getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { supabaseRequest } from "@/lib/store";
import { normalizeWorkspaceRole } from "@/lib/workspace";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as OrderDeliveryCompletionCommand | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok || scope.role !== "customer" || !scope.customerSession) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("STAGE_D_ORDER_COMPLETION", scope.companyId)) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const session = scope.customerSession;
  const deliveryAllowed = session.duties?.includes("delivery") || isLegacyDeliveryOwner({
    assignedVehicle: session.assignedVehicle,
    staffAccessV2Enabled: process.env.STAFF_ACCESS_V2_ENABLED === "true",
    workspaceRole: normalizeWorkspaceRole(session.workspaceRole)
  });
  const actorKey = session.companyMemberId || session.userId;
  if (!body || !deliveryAllowed || !actorKey) return NextResponse.json({ message: "배송 기사 권한이 필요합니다." }, { status: 403 });

  const assignment = getCustomerAssignmentKeys(session, { forceScope: true });
  const driverKeys = Array.from(new Set([getCustomerOperationalName(session), ...(assignment?.legacyManagerKeys || [])].map((value) => value.trim()).filter(Boolean)));
  const vehicleKeys = Array.from(new Set([session.assignedVehicle, session.vehicleDisplayName, session.routeUnitName].map((value) => value?.trim()).filter(Boolean) as string[]));
  try {
    return NextResponse.json({ completion: await completeOrderDelivery(body, {
      actorKey,
      companyId: scope.companyId,
      driverKeys,
      staffMemberId: assignment?.staffMemberId,
      vehicleKeys
    }, supabaseRequest) });
  } catch (error) {
    if (error instanceof DeliveryCompletionError) return NextResponse.json({ message: error.message }, { status: 409 });
    console.error("[delivery-completions] completion_failed", error);
    return NextResponse.json({ message: "배송 완료 요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
