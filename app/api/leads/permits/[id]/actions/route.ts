import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { listPermitLeadActions } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const actions = await listPermitLeadActions(scope.companyId!, id);
    return NextResponse.json({ actions });
  } catch (error) {
    console.error("permit lead actions failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "영업 이력을 불러오지 못했습니다." }, { status: 500 });
  }
}
