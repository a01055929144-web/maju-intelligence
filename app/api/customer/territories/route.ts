import { NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getCompanyStaffMemberOptions, getDeliveryTerritories, saveDeliveryTerritory } from "@/lib/store";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [territories, staff] = await Promise.all([
    getDeliveryTerritories(session.companyId),
    getCompanyStaffMemberOptions(session.companyId)
  ]);
  return NextResponse.json({ territories, staff });
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!customerHasCapability(session, "manage_company")) {
    return NextResponse.json({ error: "권역을 변경할 권한이 없습니다." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string; name?: string; isActive?: boolean; areas?: string[]; staffMemberIds?: string[];
  } | null;
  if (!body?.name?.trim()) return NextResponse.json({ error: "권역명을 입력해주세요." }, { status: 400 });
  try {
    const id = await saveDeliveryTerritory(session.companyId, {
      id: body.id,
      name: body.name,
      isActive: body.isActive,
      areas: Array.isArray(body.areas) ? body.areas : [],
      staffMemberIds: Array.isArray(body.staffMemberIds) ? body.staffMemberIds : []
    });
    const territories = await getDeliveryTerritories(session.companyId);
    return NextResponse.json({ id, territories });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "권역을 저장하지 못했습니다." }, { status: 400 });
  }
}
