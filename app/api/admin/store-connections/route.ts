import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { isId } from "@/domains/pricing/document";
import { adminActorKey, adminCloseStore, adminInviteOwner, adminLinkMember, adminRemoveMember, adminStoreConnectionEnabled, listAdminStoreConnection, searchKakaoUsers } from "@/lib/store/07-admin-store-connection";

// CX-144 U0: MAJU 관리자만(고객사 세션 불가). 기본 OFF + 회사 allowlist. 비밀·토큰은 응답에 점주 초대 링크 한 번만 담는다.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const reply = (status: number, message: string) => NextResponse.json({ message }, { status, headers });

function errorReply(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/store_connection_unavailable/.test(message)) return reply(409, "이미 종료됐거나 처리할 수 없는 매장입니다.");
  if (/store_connection_member_unavailable/.test(message)) return reply(409, "이미 해제됐거나 없는 구성원입니다.");
  if (/store_account_exists/.test(message)) return reply(409, "활성 점주가 있어 초대할 수 없습니다. 먼저 점주 연결을 해제해 주세요.");
  if (/store_customer_business_number_required/.test(message)) return reply(422, "거래처 사업자번호 10자리가 있어야 초대할 수 있습니다.");
  if (/store_link_reason_required/.test(message)) return reply(400, "연결 사유를 2자 이상 입력해 주세요.");
  if (/store_link_user_unavailable/.test(message)) return reply(409, "카카오로 로그인한 적이 있는 활성 사용자만 연결할 수 있습니다.");
  if (/active_store_member_exists/.test(message)) return reply(409, "이미 이 매장에 연결된 사용자입니다.");
  if (/active_store_owner_exists/.test(message)) return reply(409, "점주가 이미 있습니다. 점주 교체를 확인해 주세요.");
  if (/store_owner_activation_pending/.test(message)) return reply(409, "이미 만든 초대 링크가 유효합니다. 만료(30분) 후 다시 만들어 주세요.");
  return reply(503, "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return reply(401, "관리자 로그인이 필요합니다.");
  const companyId = request.nextUrl.searchParams.get("companyId") ?? "", storeAccountId = request.nextUrl.searchParams.get("storeAccountId") ?? "";
  if (!isId(companyId)) return reply(400, "매장을 확인해 주세요.");
  if (!adminStoreConnectionEnabled(companyId)) return reply(404, "사용할 수 없는 기능입니다.");
  const search = request.nextUrl.searchParams.get("q");
  if (search !== null) {
    try { return NextResponse.json({ users: await searchKakaoUsers(search.slice(0, 60)) }, { headers }); }
    catch { return reply(503, "사용자를 찾지 못했습니다."); }
  }
  if (!isId(storeAccountId)) return reply(400, "매장을 확인해 주세요.");
  try {
    const connection = await listAdminStoreConnection(companyId, storeAccountId);
    return connection ? NextResponse.json(connection, { headers }) : reply(404, "매장을 찾을 수 없습니다.");
  } catch { return reply(503, "매장 연결을 불러오지 못했습니다."); }
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return reply(401, "관리자 로그인이 필요합니다.");
  try {
    const origin = new URL(request.headers.get("origin") || "invalid");
    if (origin.host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase()) return reply(403, "같은 화면에서 다시 시도해 주세요.");
  } catch { return reply(403, "같은 화면에서 다시 시도해 주세요."); }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !isId(body.companyId) || !isId(body.storeAccountId)) return reply(400, "요청을 확인해 주세요.");
  const companyId = String(body.companyId), storeAccountId = String(body.storeAccountId);
  if (!adminStoreConnectionEnabled(companyId)) return reply(404, "사용할 수 없는 기능입니다.");
  const adminKey = adminActorKey(session.email);
  try {
    if (body.action === "close") { await adminCloseStore({ companyId, storeAccountId, adminKey }); return NextResponse.json({ ok: true }, { headers }); }
    if (body.action === "remove_member") {
      if (!isId(body.memberId)) return reply(400, "구성원을 확인해 주세요.");
      await adminRemoveMember({ companyId, storeAccountId, memberId: String(body.memberId), adminKey });
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.action === "link_member") {
      const role = body.role;
      if (!isId(body.userId) || (role !== "owner" && role !== "manager" && role !== "staff")) return reply(400, "연결할 사용자와 역할을 확인해 주세요.");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length < 2 || reason.length > 500) return reply(400, "연결 사유를 2자 이상 입력해 주세요.");
      await adminLinkMember({ companyId, storeAccountId, userId: String(body.userId), role, reason, replaceOwner: body.replaceOwner === true, adminKey });
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.action === "add_owner") {
      // 거래처 id는 요청에서 받지 않고 그 매장 계정의 거래처만 쓴다(다른 거래처 초대 방지).
      const connection = await listAdminStoreConnection(companyId, storeAccountId);
      if (!connection) return reply(404, "매장을 찾을 수 없습니다.");
      return NextResponse.json(await adminInviteOwner({ companyId, customerId: connection.customerId, adminKey }), { headers });
    }
    return reply(400, "요청을 확인해 주세요.");
  } catch (error) { return errorReply(error); }
}
