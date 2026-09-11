import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { CustomerMasterInput, getCustomerMaster, upsertCustomerMaster } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const offsetParam = request.nextUrl.searchParams.get("offset");
  const offset = offsetParam ? Math.max(0, Number.parseInt(offsetParam, 10) || 0) : 0;

  try {
    const result = await getCustomerMaster(scope.companyId, { assignmentKeys: getCustomerAssignmentKeys(scope.customerSession), offset });
    return NextResponse.json(result);
  } catch (error) {
    // 2026-09-11 버그 수정: 이 예외를 못 잡으면 Next.js가 일반 500(HTML) 응답을 만들고,
    // 클라이언트(app/crm/timeline/page.tsx)는 !response.ok를 "거래처 0건"과 동일하게
    // 처리해버려서 실제로는 데이터가 있는 회사도 원장이 빈 것처럼 보였습니다
    // (docs/pages/customers.md KNOWN ISSUES 참고). 진짜 empty(source:"empty")와
    // 구분되는 명시적인 에러 응답을 내려줍니다.
    console.error("[api/customers] getCustomerMaster failed", error);
    return NextResponse.json(
      {
        customers: [],
        message: error instanceof Error ? error.message : "거래처 원장을 불러오지 못했습니다.",
        source: "error",
        truncated: false
      },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | (CustomerMasterInput & {
        companyId?: string;
        validateBusinessNumber?: boolean;
        confirmDuplicate?: boolean;
      })
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처 정보를 등록·수정할 권한이 없습니다." }, { status: 403 });
  }

  if (!body?.customerName) {
    return NextResponse.json({ message: "거래처명은 필수입니다." }, { status: 400 });
  }
  if (body.validateBusinessNumber && body.businessNumber && !isValidBusinessRegistrationNumber(body.businessNumber)) {
    return NextResponse.json({ message: "유효하지 않은 사업자등록번호입니다." }, { status: 400 });
  }

  const result = await upsertCustomerMaster(
    body,
    scope.companyId,
    {
      actorName: scope.customerSession?.name || scope.adminSession?.name || "시스템",
      actorRole: scope.role,
      requestMethod: request.method
    },
    { confirmDuplicate: body.confirmDuplicate }
  );
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}

function isValidBusinessRegistrationNumber(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (!/^[0-9]{10}$/.test(digits)) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[9]);
}
