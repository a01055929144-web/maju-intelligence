import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { getKakaoIndustryBackfillPreview } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim() || undefined;
  try {
    return NextResponse.json({ preview: await getKakaoIndustryBackfillPreview(companyId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업종 백필 후보를 확인하지 못했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
