import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { parseAdminStoreStatusInput, isAdminStoreManagementCompanyAllowed } from "@/domains/store/admin-store-status";
import { setAdminStoreStatus } from "@/lib/admin-store-status";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (session.role !== "super_admin") return NextResponse.json({ message: "대표 관리자 권한이 필요합니다." }, { status: 403 });

  const input = parseAdminStoreStatusInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ message: "회사, 매장, 상태와 요청 키를 확인해 주세요." }, { status: 400 });
  if (!isAdminStoreManagementCompanyAllowed(input.companyId)) return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404 });

  try {
    return NextResponse.json(await setAdminStoreStatus(input, { name: session.name, userId: session.userId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("admin_store_profile_not_found")) return NextResponse.json({ message: "이 회사에 연결된 매장을 찾을 수 없습니다." }, { status: 404 });
    if (message.includes("admin_store_profile_closed")) return NextResponse.json({ message: "종료된 매장은 이 화면에서 상태를 바꿀 수 없습니다." }, { status: 409 });
    if (message.includes("admin_store_status_idempotency_conflict")) return NextResponse.json({ message: "같은 요청 키가 다른 변경에 이미 사용되었습니다. 새 요청 키로 다시 시도해 주세요." }, { status: 409 });
    console.error("[admin/stores/status] update failed", error);
    return NextResponse.json({ message: "매장 상태를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
