import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getSystemDiagnostics, getVisitTimeline } from "@/lib/store";

export const dynamic = "force-dynamic";

const sampleTimeline = [
  {
    id: "history-001",
    expectedRevenue: 320,
    leadName: "성수 온반",
    memo: "대표가 단가표 재요청. 다음 방문 때 냉동 품목 제안 예정.",
    nextAction: "단가표 발송",
    region: "성수동",
    result: "quote-requested",
    visitedAt: "2026-07-08"
  }
];

export async function GET(request: NextRequest) {
  const scope = getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const errors: string[] = [];
  let system = null;
  let timeline = sampleTimeline;

  try {
    system = await getSystemDiagnostics();
  } catch (error) {
    errors.push(`시스템 진단 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  }

  try {
    const rows = await getVisitTimeline(scope.companyId);
    if (rows.length) timeline = rows;
  } catch (error) {
    errors.push(`방문 히스토리 조회 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  }

  const dbSummary = buildDatabaseSummary(system);

  return NextResponse.json({
    dbSummary,
    errorMessage: errors.join(" / "),
    timeline
  });
}

function buildDatabaseSummary(system: Awaited<ReturnType<typeof getSystemDiagnostics>> | null) {
  if (!system) {
    return {
      description: "DB 진단 API가 실패했습니다. Vercel 환경변수와 Supabase 테이블 상태를 확인해야 합니다.",
      label: "DB 진단 실패",
      normalizedCustomers: null,
      tone: "fallback",
      visitResults: null
    };
  }

  const normalizedCustomers = system.databaseChecks?.find((check) => check.name === "정제 거래처")?.count ?? null;
  const visitResults = system.databaseChecks?.find((check) => check.name === "방문 결과")?.count ?? null;
  const hasFailedCheck = system.databaseChecks?.some((check) => check.status !== "ready") ?? false;
  const ready = system.mode === "production-db" && !hasFailedCheck;

  return {
    description: ready
      ? "Supabase 실 DB가 연결되어 있고 주요 테이블 조회가 가능합니다."
      : system.mode === "production-db"
        ? "Supabase 환경변수는 있으나 일부 테이블 조회를 확인해야 합니다."
        : "Supabase 환경변수가 없거나 미완성이라 기준 데이터와 함께 표시합니다.",
    label: ready ? "실 DB 연결" : system.mode === "production-db" ? "DB 점검 필요" : "저장 확인 필요",
    normalizedCustomers,
    tone: ready ? "ready" : "fallback",
    visitResults
  };
}
