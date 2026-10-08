import { NextRequest, NextResponse } from "next/server";
import { listLeadContacts } from "@/application/lead/manage-lead-actions";
import { getRequestAuthScope } from "@/lib/auth";
import { leadActionRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") || "20");
    const actions = await listLeadContacts(leadActionRepository, scope.companyId!, id, limit);
    return NextResponse.json({ actions });
  } catch (error) {
    console.error("permit lead actions failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "영업 이력을 불러오지 못했습니다." }, { status: 500 });
  }
}
