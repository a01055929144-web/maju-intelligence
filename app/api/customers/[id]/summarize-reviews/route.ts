import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { summarizeCustomerReviewText } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// POST: 담당자가 네이버플레이스·카카오맵 등에서 직접 읽고 복사해 붙여넣은 리뷰 텍스트를
// 규칙 기반 AI 요약기로 즉시 요약·키워드화합니다. 이 라우트는 어떤 외부 URL도 스스로 가져오지
// 않습니다 — body의 rawText(사람이 이미 복사해온 텍스트)만 처리합니다.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string; rawText?: string; source?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리뷰를 요약할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.rawText?.trim()) {
    return NextResponse.json({ message: "붙여넣은 리뷰 텍스트가 없습니다." }, { status: 400 });
  }

  try {
    const outcome = await summarizeCustomerReviewText(scope.companyId!, id, {
      rawText: body.rawText,
      source: body.source || "직접 입력"
    });
    if (!outcome.ok) return NextResponse.json({ message: outcome.message || "리뷰 요약에 실패했습니다." }, { status: 400 });
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("manual review summarize failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "리뷰 요약 중 오류가 발생했습니다." }, { status: 500 });
  }
}
