import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { saveProductSupplierProfile } from "@/lib/product-suppliers";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const body = (await request.json().catch(() => null)) as null | {
    businessNumber?: string;
    companyId?: string;
    contactEmail?: string;
    contactName?: string;
    contactPhone?: string;
    memo?: string;
    paymentTerms?: string;
    representativeName?: string;
  };
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_sales")) {
    return NextResponse.json(
      { message: "매입처 기본정보를 수정할 권한이 없습니다." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: "매입처를 선택해 주세요." }, { status: 400 });
  }

  try {
    const supplier = await saveProductSupplierProfile(scope.companyId!, id, body || {});
    return NextResponse.json({ supplier });
  } catch (error) {
    const message = error instanceof Error ? error.message : "매입처 기본정보를 저장하지 못했습니다.";
    const status = /찾지 못했습니다/.test(message)
      ? 404
      : /10자리|이하|사용 중/.test(message)
        ? 400
        : 500;
    return NextResponse.json({ message }, { status });
  }
}
