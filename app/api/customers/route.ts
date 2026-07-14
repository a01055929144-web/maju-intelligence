import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { CustomerMasterInput, getCustomerMaster, upsertCustomerMaster } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await getCustomerMaster(scope.companyId);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as (CustomerMasterInput & { companyId?: string; validateBusinessNumber?: boolean }) | null;
  const scope = getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!body?.customerName) {
    return NextResponse.json({ message: "거래처명은 필수입니다." }, { status: 400 });
  }
  if (body.validateBusinessNumber && body.businessNumber && !isValidBusinessRegistrationNumber(body.businessNumber)) {
    return NextResponse.json({ message: "유효하지 않은 사업자등록번호입니다." }, { status: 400 });
  }

  const result = await upsertCustomerMaster(body, scope.companyId);
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
