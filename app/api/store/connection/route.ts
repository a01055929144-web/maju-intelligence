import { NextRequest, NextResponse } from "next/server";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { saveStoreConnection, storeConnectionEnabled } from "@/lib/store/07-store-connection";
import { changeStoreConnection } from "@/application/organization/change-store-connection";
import { canChangeStoreConnection } from "@/domains/organization/store-connection";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || "";
  const storeAccountId = request.nextUrl.searchParams.get("storeAccountId") || "";
  if (!uuid.test(companyId) || !uuid.test(storeAccountId)) return reply({ message: "매장 정보를 확인해 주세요." }, 400);
  if (!storeConnectionEnabled(companyId)) return reply({ message: "사용할 수 없는 기능입니다." }, 404);
  try {
    const member = await getStoreMemberContext({ companyId, storeAccountId });
    if (!member) return reply({ message: "매장 로그인을 확인한 뒤 다시 열어 주세요." }, 403);
    return reply({ canLeave: canChangeStoreConnection(member.role, "leave"), canClose: canChangeStoreConnection(member.role, "close") });
  } catch { return reply({ message: "연결 정보를 불러오지 못했습니다. 다시 시도해 주세요." }, 503); }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      return reply({ message: "같은 매장 화면에서 다시 시도해 주세요." }, 403);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("companyId" in body) || !("storeAccountId" in body) || !("action" in body) ||
      typeof body.companyId !== "string" || !uuid.test(body.companyId) || typeof body.storeAccountId !== "string" || !uuid.test(body.storeAccountId) ||
      (body.action !== "leave" && body.action !== "close")) return reply({ message: "연결 정보를 확인해 주세요." }, 400);
    if (!storeConnectionEnabled(body.companyId)) return reply({ message: "사용할 수 없는 기능입니다." }, 404);
    const member = await getStoreMemberContext({ companyId: body.companyId, storeAccountId: body.storeAccountId });
    if (!member || !canChangeStoreConnection(member.role, body.action))
      return reply({ message: "연결을 변경할 권한이 없습니다. 점주는 매장 이용 종료를 선택해 주세요." }, 403);
    await changeStoreConnection({ ...member, action: body.action }, saveStoreConnection);
    return reply({ completed: true, action: body.action });
  } catch { return reply({ message: "변경을 확인하지 못했습니다. 매장 화면을 다시 열어 현재 연결 상태를 확인해 주세요." }, 409); }
}
