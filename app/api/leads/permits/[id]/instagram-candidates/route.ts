import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { discoverInstagramCandidates } from "@/lib/instagram-discovery";
import { getPermitLeadIdentityForCompany } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST: 리드의 인스타그램 아이디 후보를 네이버 검색 결과에서 찾아 돌려줍니다. 저장은 하지 않습니다
// (사용자가 프로필을 확인한 뒤 PATCH /api/leads/permits/[id] 의 instagramUrl로 저장).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId || request.nextUrl.searchParams.get("companyId") || undefined);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드 정보를 볼 권한이 없습니다." }, { status: 403 });
  }

  try {
    const lead = await getPermitLeadIdentityForCompany(scope.companyId!, id);
    if (!lead) return NextResponse.json({ message: "리드를 찾을 수 없습니다." }, { status: 404 });
    const result = await discoverInstagramCandidates({ businessName: lead.businessName, address: lead.address, industry: lead.industry });
    return NextResponse.json(result, { status: result.ok ? 200 : result.reason === "not_configured" ? 200 : 502 });
  } catch (error) {
    console.error("instagram candidate discovery failed:", error);
    return NextResponse.json({ message: "인스타 후보를 찾는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
