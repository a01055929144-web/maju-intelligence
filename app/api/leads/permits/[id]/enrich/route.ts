import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { enrichPermitLeadExternalInfo } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드 정보를 보강할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await enrichPermitLeadExternalInfo(scope.companyId!, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead enrich failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "외부 정보 보강 중 오류가 발생했습니다." }, { status: 500 });
  }
}
