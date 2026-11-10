import { createHmac, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { supabaseRequest } from "@/lib/store";
import { INVITE_CODE_EXPIRY_DAYS, inviteCodeFromBytes } from "../../../domains/store/invite-code";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CodeRow = { id: string; created_at: string; expires_at: string; revoked_at: string | null };

// 직접 가입(R2)이 켜진 회사에서만. CX-10 SQL 적용 전에는 전역 OFF라 404.
const enabled = () => process.env.STORE_DIRECT_SIGNUP_ENABLED === "true" && priceSheetsEnabled() && storeOrderingEnabled();
const unavailable = () => NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });

/** 8자 코드는 짧아 평문 SHA-256이면 해시 유출 시 대입으로 찾을 수 있다. 서버 비밀값으로 HMAC. */
function hashInviteCode(code: string) {
  const secret = process.env.STORE_LINK_SECRET;
  if (!secret || secret.length < 32) throw new Error("Store link secret is not configured.");
  return createHmac("sha256", secret).update(`store-invite-code.v1:${code}`).digest("hex");
}

function sameOrigin(request: NextRequest) {
  const raw = request.headers.get("origin");
  if (!raw) return true;
  try {
    const origin = new URL(raw);
    return ["http:", "https:"].includes(origin.protocol) &&
      origin.host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase();
  } catch { return false; }
}

async function authorize(request: NextRequest, write: boolean, companyId?: string) {
  if (!enabled()) return unavailable();
  if (write && !sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.companyId || !(isFeatureEnabled("PRICING", auth.companyId) && isFeatureEnabled("STORE_ORDERING", auth.companyId))) return unavailable();
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession))
    return NextResponse.json({ message: "매장 초대코드는 대표·관리자만 관리할 수 있습니다." }, { status: 403 });
  // MAJU 관리자 미리보기는 보기만.
  if (write && !auth.customerSession) return NextResponse.json({ message: "고객사 계정으로 발급해 주세요." }, { status: 403 });
  return { companyId: auth.companyId, actorKey: auth.customerSession?.userId || auth.customerSession?.email || "admin-preview" };
}

export async function GET(request: NextRequest) {
  const scope = await authorize(request, false, request.nextUrl.searchParams.get("companyId") || undefined);
  if (scope instanceof NextResponse) return scope;
  const company = encodeURIComponent(scope.companyId);
  try {
    const codes = await supabaseRequest<CodeRow[]>(
      `company_store_invite_codes?company_id=eq.${company}&select=id,created_at,expires_at,revoked_at&order=created_at.desc&limit=50`);
    const used = codes.length ? await supabaseRequest<Array<{ invite_code_id: string }>>(
      `store_accounts?company_id=eq.${company}&invite_code_id=in.(${codes.map((code) => code.id).join(",")})&select=invite_code_id`) : [];
    return NextResponse.json({ items: codes.map((code) => ({ id: code.id, createdAt: code.created_at, expiresAt: code.expires_at,
      revokedAt: code.revoked_at, storeCount: used.filter((row) => row.invite_code_id === code.id).length })) },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "초대코드를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ message: "입력값을 확인해 주세요." }, { status: 400 }); }
  const scope = await authorize(request, true, typeof body.companyId === "string" ? body.companyId : undefined);
  if (scope instanceof NextResponse) return scope;
  try {
    if (body.action === "revoke") {
      if (typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ message: "회수할 코드를 다시 선택해 주세요." }, { status: 400 });
      await supabaseRequest("rpc/revoke_company_store_invite_code_v1", { method: "POST", body: JSON.stringify({ p_company_id: scope.companyId, p_code_id: body.id }) });
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "issue" || !INVITE_CODE_EXPIRY_DAYS.includes(body.expiresInDays as (typeof INVITE_CODE_EXPIRY_DAYS)[number]))
      return NextResponse.json({ message: "만료 기간을 다시 선택해 주세요." }, { status: 400 });
    let code: string | null = null;
    while (!code) code = inviteCodeFromBytes(randomBytes(16));
    const expiresAt = new Date(Date.now() + Number(body.expiresInDays) * 86_400_000).toISOString();
    const id = await supabaseRequest<string>("rpc/issue_company_store_invite_code_v1", { method: "POST",
      body: JSON.stringify({ p_company_id: scope.companyId, p_code_hash: hashInviteCode(code), p_expires_at: expiresAt, p_created_by_key: scope.actorKey }) });
    // 원문 코드는 이 응답에서 한 번만 돌려준다(저장하지 않음).
    return NextResponse.json({ id, code, expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.includes("store_invite_code_not_found"))
      return NextResponse.json({ message: "이미 없는 코드입니다. 새로고침해 주세요." }, { status: 404 });
    return NextResponse.json({ message: "처리하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
