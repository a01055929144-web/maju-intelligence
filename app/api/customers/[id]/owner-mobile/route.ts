import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canAccessAssignedCustomer } from "@/lib/store";
import { phoneLinkEnabledFor, readOwnerMobileState, resolveOwnerMobileNotice, saveOwnerMobile } from "@/lib/store/07-store-phone-link-company";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// CX-146: 거래처 '점주 휴대폰'(010) 입력과 알림. FEATURE_STORE_PHONE_LINK 회사만(꺼져 있으면 404). 응답에는 뒤 4자리만.
async function authorize(request: NextRequest, id: string, manage: boolean) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!phoneLinkEnabledFor(scope.companyId) || !UUID.test(id)) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (manage && !scopeHasCapability(scope, "manage_customers")) return { error: NextResponse.json({ message: "거래처 정보를 수정할 권한이 없습니다." }, { status: 403 }) };
  if (!(await canAccessAssignedCustomer(scope.companyId, id, getCustomerAssignmentKeys(scope.customerSession))))
    return { error: NextResponse.json({ message: "담당 거래처에만 접근할 수 있습니다." }, { status: 403 }) };
  return { companyId: scope.companyId };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(request, id, false);
  if (auth.error) return auth.error;
  return NextResponse.json(await readOwnerMobileState(auth.companyId!, id), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(request, id, true);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { ownerMobile?: unknown; resolveNoticeId?: unknown } | null;
  if (typeof body?.resolveNoticeId === "string" && UUID.test(body.resolveNoticeId)) await resolveOwnerMobileNotice(auth.companyId!, id, body.resolveNoticeId);
  else if (body && "ownerMobile" in body) {
    if (!(await saveOwnerMobile(auth.companyId!, id, body.ownerMobile))) return NextResponse.json({ message: "010으로 시작하는 휴대폰 번호를 입력해 주세요." }, { status: 400 });
  } else return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
  return NextResponse.json(await readOwnerMobileState(auth.companyId!, id), { headers: { "Cache-Control": "no-store" } });
}
