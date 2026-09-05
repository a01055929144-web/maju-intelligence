import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { syncCustomerGoogleReviews } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST: 거래처 하나의 구글 리뷰를 지금 바로 다시 수집합니다("리뷰 새로고침" 버튼).
// review_source와 무관하게 항상 갱신합니다 — 담당자가 명시적으로 누른 동작이기 때문입니다.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리뷰를 새로고침할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const outcome = await syncCustomerGoogleReviews(scope.companyId!, id);
    if (!outcome.ok) return NextResponse.json({ message: outcome.message || "리뷰 새로고침에 실패했습니다." }, { status: 400 });
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("google review sync failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "리뷰 새로고침 중 오류가 발생했습니다." }, { status: 500 });
  }
}
