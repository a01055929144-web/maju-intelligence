import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { resolveLeadContactActorName } from "@/domains/lead/lead-action";
import {
  deletePermitLead,
  updatePermitLeadContactPhones,
  updatePermitLeadProfile,
  type PermitLeadContactPhoneInput,
  type PermitLeadProfileInput
} from "@/lib/store";

const PROFILE_KEYS = ["businessNumber", "subBusinessNumber", "instagramUrl", "fax", "email", "naverTalktalkUrl"] as const;
const CONTACT_PHONE_KEYS = ["ownerMobilePhone", "storePhone"] as const;

// 요청 본문에 실제로 들어온 칸만 수정합니다(보내지 않은 칸을 null로 지우지 않도록).
function pickPermitLeadProfileInput(body: Record<string, unknown> | null): PermitLeadProfileInput {
  const input: PermitLeadProfileInput = {};
  for (const key of PROFILE_KEYS) {
    if (!body || !(key in body)) continue;
    const value = body[key];
    input[key] = typeof value === "string" ? value.trim() : null;
  }
  return input;
}

function pickPermitLeadContactPhoneInput(body: Record<string, unknown> | null): PermitLeadContactPhoneInput | null {
  const input: PermitLeadContactPhoneInput = {};
  for (const key of CONTACT_PHONE_KEYS) {
    if (!body || !(key in body)) continue;
    const value = body[key];
    if (value !== null && typeof value !== "string") return null;
    input[key] = typeof value === "string" ? value.trim() : null;
  }
  return input;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; businessNumber?: string | null; subBusinessNumber?: string | null; instagramUrl?: string | null; fax?: string | null; email?: string | null; naverTalktalkUrl?: string | null; ownerMobilePhone?: string | null; storePhone?: string | null }
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드 정보를 수정할 권한이 없습니다." }, { status: 403 });
  }

  const hasContactPhoneChange = CONTACT_PHONE_KEYS.some((key) => body && key in body);
  const hasProfileChange = PROFILE_KEYS.some((key) => body && key in body);
  if (hasContactPhoneChange && hasProfileChange) {
    return NextResponse.json({ message: "점주 휴대폰·매장 전화는 다른 기본 정보와 나누어 저장해주세요." }, { status: 400 });
  }
  if (hasContactPhoneChange) {
    const phoneInput = pickPermitLeadContactPhoneInput(body);
    if (!phoneInput) return NextResponse.json({ message: "전화번호 입력값을 확인해주세요." }, { status: 400 });
    const companyMemberId = scope.customerSession?.companyMemberId;
    if (!companyMemberId) {
      return NextResponse.json({ message: "활성 회사 구성원만 리드 전화번호를 수정할 수 있습니다." }, { status: 403 });
    }
    try {
      const result = await updatePermitLeadContactPhones(scope.companyId!, id, companyMemberId, phoneInput);
      return NextResponse.json(result, { status: result.ok ? 200 : result.message === "리드를 찾을 수 없습니다." ? 404 : 400 });
    } catch (error) {
      console.error("permit lead contact phone update failed:", error);
      return NextResponse.json({ message: error instanceof Error ? error.message : "전화번호 수정 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  try {
    const result = await updatePermitLeadProfile(
      scope.companyId!,
      id,
      pickPermitLeadProfileInput(body),
      {
        actorName: resolveLeadContactActorName([
          getCustomerOperationalName(scope.customerSession),
          scope.customerSession?.name,
          scope.adminSession?.name
        ]),
        actorUserId: scope.customerSession?.userId,
        source: "manual"
      }
    );
    return NextResponse.json(result, { status: result.ok ? 200 : result.message === "리드를 찾을 수 없습니다." ? 404 : 400 });
  } catch (error) {
    console.error("permit lead update failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE: 잘못 들어온 리드(테스트/명백한 오탐)를 완전히 삭제합니다. 일반적인 "영업 제외"는
// 목록에서만 숨기는 액션(POST .../action, actionType=exclude)을 쓰고, 이 엔드포인트는
// 데이터 자체를 지워야 하는 경우에만 사용합니다.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드를 삭제할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await deletePermitLead(scope.companyId!, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead delete failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
